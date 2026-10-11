"""Weekly metrics computed in DuckDB over snapshots, events and tags (see SPEC.md, "Metrics")."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path

import duckdb
import pandas as pd

from .config import ATTRIBUTES, DATA_DIR
from .storage import list_snapshot_dates, read_events, read_tags, snapshots_dir

LAUNCH_WINDOW_DAYS = 56
SERIES_WEEKS = 12
BASELINE_WEEKS = 8
MIN_ALERT_COUNT = 5
LOW_N = 10
MIN_LAUNCHED = 8  # no index on fewer launches: the denominator is too small to mean anything


@dataclass
class WeeklyMetrics:
    report_date: str
    week_start: str
    snapshot_dates: list[str]
    brands: pd.DataFrame
    attributes: pd.DataFrame
    series: pd.DataFrame
    alerts: pd.DataFrame
    sizes: pd.DataFrame
    calibration: bool
    weeks_of_history: int
    movements: list[dict] = field(default_factory=list)


def _connect(data_dir: Path) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    snaps = snapshots_dir(data_dir)
    files = sorted(snaps.glob("????-??-??.parquet"))
    if files:
        con.execute(f"CREATE VIEW snapshots AS SELECT * FROM read_parquet({[str(f) for f in files]!r}, union_by_name=true)")
    else:
        con.execute("CREATE TABLE snapshots (snapshot_date VARCHAR, brand VARCHAR, role VARCHAR, product_id BIGINT, "
                    "title VARCHAR, published_at VARCHAR, variant_id BIGINT, size VARCHAR, price DOUBLE, "
                    "compare_at_price DOUBLE, available BOOLEAN)")
    con.register("events", read_events(data_dir))
    con.register("tags", read_tags(data_dir))
    return con


def _prepare(report_date: str | None, data_dir: Path) -> tuple[duckdb.DuckDBPyConnection, str, str, list[str]]:
    """Connect to the data and create the views every metric builds on (`latest`, `net_sold_out`, `launches`).

    Returns (connection, report_date, latest snapshot date on or before it, all snapshot dates).
    """
    dates = list_snapshot_dates(data_dir)
    if not dates:
        raise RuntimeError("no snapshots found")
    report_date = report_date or dates[-1]
    latest = max(d for d in dates if d <= report_date)
    con = _connect(data_dir)
    con.execute(f"CREATE VIEW latest AS SELECT * FROM snapshots WHERE snapshot_date = '{latest}'")
    con.execute(
        """
        CREATE VIEW net_sold_out AS
        SELECT s.* FROM events s
        WHERE s.event_type = 'sold_out'
          AND NOT EXISTS (
            SELECT 1 FROM events r
            WHERE r.event_type = 'restock' AND r.variant_id = s.variant_id
              AND CAST(r.event_date AS DATE) > CAST(s.event_date AS DATE)
              AND CAST(r.event_date AS DATE) <= CAST(s.event_date AS DATE) + INTERVAL 7 DAY)
        """
    )
    # Launch date per product: published_at (date part), fallback first-seen snapshot
    con.execute(
        """
        CREATE VIEW launches AS
        SELECT brand, product_id, role,
               COALESCE(TRY_CAST(SUBSTR(MIN(published_at), 1, 10) AS DATE), MIN(CAST(snapshot_date AS DATE))) AS launch_date
        FROM snapshots GROUP BY brand, product_id, role
        """
    )
    return con, report_date, latest, dates


def compute(report_date: str | None = None, data_dir: Path = DATA_DIR) -> WeeklyMetrics:
    con, report_date, _, dates = _prepare(report_date, data_dir)
    rd = dt.date.fromisoformat(report_date)
    week_start = (rd - dt.timedelta(days=6)).isoformat()
    brands = _brand_table(con, report_date, week_start)
    attributes = _attribute_table(con, report_date)
    series, alerts, weeks_hist = _series_and_alerts(con, report_date)
    sizes = con.execute(
        f"""
        SELECT l.brand, l.size, COUNT(*) AS n FROM net_sold_out e
        JOIN latest l ON l.variant_id = e.variant_id
        WHERE e.event_date BETWEEN '{week_start}' AND '{report_date}' AND l.size IS NOT NULL
        GROUP BY 1, 2 ORDER BY 1, 3 DESC
        """
    ).df()
    calibration = weeks_hist < BASELINE_WEEKS
    m = WeeklyMetrics(report_date, week_start, [d for d in dates if d <= report_date], brands, attributes,
                      series, alerts, sizes, calibration, weeks_hist)
    m.movements = _movements(m)
    return m


def _brand_table(con, report_date: str, week_start: str) -> pd.DataFrame:
    return con.execute(
        f"""
        WITH live AS (
          SELECT brand, role, COUNT(DISTINCT product_id) AS live_products,
                 COUNT(*) AS live_variants,
                 SUM(CASE WHEN compare_at_price > price THEN 1 ELSE 0 END) AS marked_down_variants,
                 MEDIAN(CASE WHEN compare_at_price > price THEN 1 - price / compare_at_price END) AS median_discount
          FROM latest GROUP BY brand, role),
        wk_events AS (
          SELECT brand,
                 SUM(CASE WHEN event_type = 'new_product' THEN 1 ELSE 0 END) AS new_products,
                 SUM(CASE WHEN event_type = 'restock' THEN 1 ELSE 0 END) AS restocks,
                 SUM(CASE WHEN event_type = 'product_sold_out' THEN 1 ELSE 0 END) AS products_fully_sold_out,
                 SUM(CASE WHEN event_type = 'delisted' THEN 1 ELSE 0 END) AS delisted,
                 SUM(CASE WHEN event_type = 'markdown' THEN 1 ELSE 0 END) AS markdowns
          FROM events WHERE event_date BETWEEN '{week_start}' AND '{report_date}' GROUP BY brand),
        wk_net AS (
          SELECT brand, COUNT(*) AS sold_out_variants FROM net_sold_out
          WHERE event_date BETWEEN '{week_start}' AND '{report_date}' GROUP BY brand),
        first_out AS (
          SELECT e.brand, e.product_id, MIN(CAST(e.event_date AS DATE)) AS first_sold_out
          FROM net_sold_out e GROUP BY 1, 2),
        cohort AS (
          SELECT l.brand, l.product_id, l.launch_date,
                 DATE '{report_date}' - l.launch_date AS age_days,
                 f.first_sold_out IS NOT NULL AND f.first_sold_out >= l.launch_date AS has_sold_out,
                 f.first_sold_out - l.launch_date AS days_to_first
          FROM launches l LEFT JOIN first_out f USING (brand, product_id)),
        rates AS (
          SELECT brand,
                 AVG(CASE WHEN age_days BETWEEN 8 AND 21 THEN CAST(has_sold_out AS INT) END) AS sell_out_rate_2w,
                 AVG(CASE WHEN age_days BETWEEN 22 AND 35 THEN CAST(has_sold_out AS INT) END) AS sell_out_rate_4w,
                 AVG(CASE WHEN age_days BETWEEN 50 AND 63 THEN CAST(has_sold_out AS INT) END) AS sell_out_rate_8w,
                 SUM(CASE WHEN age_days BETWEEN 22 AND 35 THEN 1 ELSE 0 END) AS cohort_4w_n,
                 MEDIAN(CASE WHEN age_days <= 84 AND has_sold_out THEN days_to_first END) AS median_days_to_first_sold_out
          FROM cohort GROUP BY brand)
        SELECT live.brand, live.role, live.live_products, live.live_variants,
               COALESCE(wk_events.new_products, 0) AS new_products,
               COALESCE(wk_net.sold_out_variants, 0) AS sold_out_variants,
               COALESCE(wk_events.products_fully_sold_out, 0) AS products_fully_sold_out,
               COALESCE(wk_events.restocks, 0) AS restocks,
               COALESCE(wk_events.delisted, 0) AS delisted,
               COALESCE(wk_events.markdowns, 0) AS markdowns,
               live.marked_down_variants * 1.0 / NULLIF(live.live_variants, 0) AS markdown_share,
               live.median_discount,
               rates.sell_out_rate_2w, rates.sell_out_rate_4w, rates.sell_out_rate_8w, rates.cohort_4w_n,
               rates.median_days_to_first_sold_out
        FROM live LEFT JOIN wk_events USING (brand) LEFT JOIN wk_net USING (brand) LEFT JOIN rates USING (brand)
        ORDER BY live.role, live.brand
        """
    ).df()


def _attribute_table(con, report_date: str) -> pd.DataFrame:
    frames = []
    for attr in ATTRIBUTES:
        frames.append(
            con.execute(
                f"""
                WITH launched AS (
                  SELECT l.brand, l.product_id, t.{attr} AS value FROM launches l
                  JOIN tags t USING (brand, product_id)
                  WHERE l.role <> 'self' AND l.launch_date >= DATE '{report_date}' - INTERVAL {LAUNCH_WINDOW_DAYS} DAY
                    AND t.{attr} IS NOT NULL),
                sold AS (
                  SELECT e.brand, e.product_id, t.{attr} AS value FROM net_sold_out e
                  JOIN tags t USING (brand, product_id)
                  JOIN launches l USING (brand, product_id)
                  WHERE l.role <> 'self' AND CAST(e.event_date AS DATE) >= DATE '{report_date}' - INTERVAL {LAUNCH_WINDOW_DAYS} DAY
                    AND t.{attr} IS NOT NULL),
                n_launched AS (SELECT value, COUNT(*) AS n FROM launched GROUP BY value),
                n_sold AS (SELECT value, COUNT(*) AS n FROM sold GROUP BY value)
                SELECT '{attr}' AS attribute, COALESCE(a.value, b.value) AS value,
                       COALESCE(a.n, 0) AS launched_n, COALESCE(b.n, 0) AS sold_out_n,
                       COALESCE(a.n, 0) * 1.0 / NULLIF((SELECT SUM(n) FROM n_launched), 0) AS share_new,
                       COALESCE(b.n, 0) * 1.0 / NULLIF((SELECT SUM(n) FROM n_sold), 0) AS share_sold_out
                FROM n_launched a FULL OUTER JOIN n_sold b USING (value)
                """
            ).df()
        )
    df = pd.concat(frames, ignore_index=True)
    df["demand_index"] = df.apply(
        lambda r: (r["share_sold_out"] / r["share_new"])
        if pd.notna(r["share_new"]) and r["share_new"] >= 0.02 and r["launched_n"] >= MIN_LAUNCHED else None,
        axis=1,
    )
    df["low_n"] = df["sold_out_n"] < LOW_N
    return df.sort_values(["attribute", "demand_index"], ascending=[True, False]).reset_index(drop=True)


def _series_and_alerts(con, report_date: str) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """Weekly net sold-out counts per attribute value, last 12 weeks, with robust baseline."""
    rd = dt.date.fromisoformat(report_date)
    start = rd - dt.timedelta(days=7 * SERIES_WEEKS - 1)
    union = " UNION ALL ".join(
        f"SELECT '{a}' AS attribute, t.{a} AS value, e.event_date FROM net_sold_out e "
        f"JOIN tags t USING (brand, product_id) JOIN launches l USING (brand, product_id) "
        f"WHERE l.role <> 'self' AND t.{a} IS NOT NULL" for a in ATTRIBUTES
    )
    raw = con.execute(
        f"""
        SELECT attribute, value,
               CAST(FLOOR((DATE '{report_date}' - CAST(event_date AS DATE)) / 7) AS INT) AS weeks_ago,
               COUNT(*) AS n
        FROM ({union}) WHERE CAST(event_date AS DATE) >= DATE '{start.isoformat()}'
        GROUP BY 1, 2, 3
        """
    ).df()
    first_event = con.execute("SELECT MIN(CAST(event_date AS DATE)) FROM events").fetchone()[0]
    weeks_hist = 0 if first_event is None else int((rd - first_event).days // 7) + 1

    if raw.empty:
        return raw, pd.DataFrame(columns=["attribute", "value", "this_week", "baseline_median", "baseline_mad"]), weeks_hist
    grid = (
        raw[["attribute", "value"]].drop_duplicates().assign(_k=1)
        .merge(pd.DataFrame({"weeks_ago": range(SERIES_WEEKS), "_k": 1}), on="_k").drop(columns="_k")
    )
    series = grid.merge(raw, on=["attribute", "value", "weeks_ago"], how="left").fillna({"n": 0})
    series["n"] = series["n"].astype(int)

    alerts = []
    for (attr, value), g in series.groupby(["attribute", "value"]):
        g = g.sort_values("weeks_ago")
        this_week = int(g.loc[g["weeks_ago"] == 0, "n"].sum())
        base = g[(g["weeks_ago"] >= 1) & (g["weeks_ago"] <= BASELINE_WEEKS)]["n"]
        if weeks_hist < BASELINE_WEEKS + 1 or base.empty:
            continue
        med = float(base.median())
        mad = float((base - med).abs().median())
        threshold = med + 2 * 1.4826 * mad
        if this_week >= MIN_ALERT_COUNT and this_week > threshold:
            alerts.append({"attribute": attr, "value": value, "this_week": this_week,
                           "baseline_median": med, "baseline_mad": mad})
    return series, pd.DataFrame(alerts, columns=["attribute", "value", "this_week", "baseline_median", "baseline_mad"]), weeks_hist


def _movements(m: WeeklyMetrics) -> list[dict]:
    """Three to five sentences' worth of structured movements, strongest first."""
    out: list[dict] = []
    attrs = m.attributes.dropna(subset=["demand_index"])
    strong = attrs[(attrs["sold_out_n"] >= (LOW_N if not m.calibration else 5)) & (attrs["demand_index"] >= 1.4)]
    for r in strong.sort_values("demand_index", ascending=False).head(3).itertuples():
        out.append({"kind": "attribute_over_index", "attribute": r.attribute, "value": r.value,
                    "index": round(r.demand_index, 2), "share_new": r.share_new, "share_sold_out": r.share_sold_out,
                    "n": int(r.sold_out_n), "low_n": bool(r.low_n), "source": "tags × net_sold_out, 8 uger"})
    weak = attrs[(attrs["launched_n"] >= 15) & (attrs["demand_index"] <= 0.5)]
    for r in weak.sort_values("demand_index").head(2).itertuples():
        out.append({"kind": "attribute_under_index", "attribute": r.attribute, "value": r.value,
                    "index": round(r.demand_index, 2), "share_new": r.share_new, "share_sold_out": r.share_sold_out,
                    "n": int(r.sold_out_n), "low_n": bool(r.low_n), "source": "tags × net_sold_out, 8 uger"})
    b = m.brands.dropna(subset=["sell_out_rate_4w"])
    b = b[b["cohort_4w_n"] >= 5]
    if len(b):
        top = b.sort_values("sell_out_rate_4w", ascending=False).iloc[0]
        out.append({"kind": "brand_sell_out_4w", "brand": top["brand"], "rate": float(top["sell_out_rate_4w"]),
                    "n": int(top["cohort_4w_n"]), "source": "launches × net_sold_out"})
    md = m.brands.dropna(subset=["markdown_share"]).sort_values("markdown_share", ascending=False)
    if len(md) and md.iloc[0]["markdown_share"] >= 0.25:
        out.append({"kind": "brand_markdown", "brand": md.iloc[0]["brand"], "share": float(md.iloc[0]["markdown_share"]),
                    "discount": md.iloc[0]["median_discount"], "source": "seneste snapshot"})
    for r in m.alerts.sort_values("this_week", ascending=False).head(2).itertuples():
        out.append({"kind": "alert", "attribute": r.attribute, "value": r.value, "this_week": int(r.this_week),
                    "median": r.baseline_median, "source": "ugeserie, 8-ugers median + 2·MAD"})
    return out[:5]


# ----------------------------------------------------------------------------- state of the latest snapshot


@dataclass
class StateMetrics:
    """What the latest snapshot looks like right now, before any event history exists.

    `sold_out_state` is a stock measure (which attribute values are over-represented among variants that
    are unavailable today), not the flow measure in WeeklyMetrics.attributes. It answers the day-one
    question "what characterises what is sold out at the peers now" and must be read with the same
    caveats: unavailable is buy depth × demand, never sales; the self brand is excluded; n < LOW_N is low.
    """

    report_date: str
    latest_date: str
    sold_out_state: pd.DataFrame  # attribute, scope (all | new), value, live_n, unavailable_n, shares, state_index, low_n
    size_depletion: pd.DataFrame  # brand, role, size, live_variants, unavailable_variants, unavailable_share
    launch_calendar: pd.DataFrame  # brand, role, week_start, products (launches in the last SERIES_WEEKS weeks)


def compute_state(report_date: str | None = None, data_dir: Path = DATA_DIR) -> StateMetrics:
    con, report_date, latest, _ = _prepare(report_date, data_dir)
    return StateMetrics(report_date, latest, _sold_out_state(con, report_date), _size_depletion(con),
                        _launch_calendar(con, report_date))


def _state_counts(con, attr: str, extra: str, role_filter: str) -> pd.DataFrame:
    return con.execute(
        f"""
        WITH v AS (
          SELECT l.available, t.{attr} AS value
          FROM latest l JOIN tags t USING (brand, product_id) JOIN launches la USING (brand, product_id)
          WHERE {role_filter} AND t.{attr} IS NOT NULL {extra})
        SELECT value, COUNT(*) AS live_n, SUM(CASE WHEN available THEN 0 ELSE 1 END) AS unavailable_n
        FROM v GROUP BY value
        """
    ).df()


STATE_COUNT_COLUMNS = ["live_n", "unavailable_n", "self_live_n", "self_unavailable_n"]


def _sold_out_state(con, report_date: str) -> pd.DataFrame:
    """Per attribute value: peers' live and unavailable variants (the index) and the self brand's own counts.

    The self brand never enters `state_index`; its columns (`self_*`) are there so the dashboard can say how
    much of its own assortment sits in a value peers are selling out of, and how that value fares in its own shop.
    """
    frames = []
    for attr in ATTRIBUTES:
        for scope, extra in (("all", ""),
                             ("new", f"AND la.launch_date >= DATE '{report_date}' - INTERVAL {LAUNCH_WINDOW_DAYS} DAY")):
            peers = _state_counts(con, attr, extra, "l.role <> 'self'")
            own = _state_counts(con, attr, extra, "l.role = 'self'").rename(
                columns={"live_n": "self_live_n", "unavailable_n": "self_unavailable_n"})
            df = peers.merge(own, on="value", how="outer")
            df.insert(0, "scope", scope)
            df.insert(0, "attribute", attr)
            frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    for col in STATE_COUNT_COLUMNS:
        df[col] = df[col].fillna(0).astype(int) if col in df.columns else 0
    if df.empty:
        for col in ("share_live", "share_unavailable", "state_index", "self_share_live", "self_share_unavailable",
                    "self_state_index"):
            df[col] = pd.Series(dtype=float)
        df["low_n"] = pd.Series(dtype=bool)
        return df
    group = df.groupby(["attribute", "scope"])
    for prefix in ("", "self_"):
        live_total = group[f"{prefix}live_n"].transform("sum")
        unavailable_total = group[f"{prefix}unavailable_n"].transform("sum")
        df[f"{prefix}share_live"] = (df[f"{prefix}live_n"] / live_total).where(live_total > 0)
        df[f"{prefix}share_unavailable"] = (df[f"{prefix}unavailable_n"] / unavailable_total).where(unavailable_total > 0)
        ok = (df[f"{prefix}share_live"] >= 0.02) & (df[f"{prefix}live_n"] >= MIN_LAUNCHED) & df[f"{prefix}share_unavailable"].notna()
        df[f"{prefix}state_index"] = (df[f"{prefix}share_unavailable"] / df[f"{prefix}share_live"]).where(ok)
    df["low_n"] = df["unavailable_n"] < LOW_N
    return df.sort_values(["scope", "attribute", "state_index"], ascending=[True, True, False]).reset_index(drop=True)


def _size_depletion(con) -> pd.DataFrame:
    return con.execute(
        """
        SELECT brand, role, size, COUNT(*) AS live_variants,
               SUM(CASE WHEN available THEN 0 ELSE 1 END) AS unavailable_variants,
               SUM(CASE WHEN available THEN 0 ELSE 1 END) * 1.0 / COUNT(*) AS unavailable_share
        FROM latest WHERE size IS NOT NULL
        GROUP BY 1, 2, 3 ORDER BY 1, 3
        """
    ).df()


def _launch_calendar(con, report_date: str) -> pd.DataFrame:
    df = con.execute(
        f"""
        SELECT brand, role, DATE_TRUNC('week', launch_date) AS week_start, COUNT(*) AS products
        FROM launches
        WHERE launch_date > DATE '{report_date}' - INTERVAL {7 * SERIES_WEEKS} DAY AND launch_date <= DATE '{report_date}'
        GROUP BY 1, 2, 3 ORDER BY 1, 3
        """
    ).df()
    if len(df):
        df["week_start"] = pd.to_datetime(df["week_start"]).dt.strftime("%Y-%m-%d")
    return df
