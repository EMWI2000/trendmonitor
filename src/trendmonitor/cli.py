"""Command-line entry point: probe | snapshot | diff | tag | report | run-daily | demo."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from .config import DATA_DIR, REPORTS_DIR, load_sources


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="trendmonitor", description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("probe", help="check every brand in sources.yaml (first page only)")
    p = sub.add_parser("snapshot", help="fetch all enabled brands and write today's snapshot")
    p.add_argument("--date")
    p.add_argument("--brand", action="append", help="limit to brand key(s)")
    p = sub.add_parser("diff", help="compute events for a snapshot date against the previous one")
    p.add_argument("--date")
    p = sub.add_parser("tag", help="tag untagged products in a snapshot")
    p.add_argument("--date")
    p.add_argument("--no-claude", action="store_true", help="rules only")
    p.add_argument("--limit", type=int)
    p = sub.add_parser("report", help="write the weekly report")
    p.add_argument("--date")
    p = sub.add_parser("profile", help="style and positioning profile of every brand vs. the self brand")
    p.add_argument("--date")
    p.add_argument("--no-claude", action="store_true", help="skip the Claude implied-customer read")
    p = sub.add_parser("run-daily", help="snapshot + diff + tag")
    p.add_argument("--date")
    p.add_argument("--no-claude", action="store_true")
    p = sub.add_parser("demo", help="offline end-to-end run on synthetic catalogues")
    p.add_argument("--days", type=int, default=70)
    p.add_argument("--seed", type=int, default=7)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("trendmonitor")

    from .diff import run_diff
    from .report import write_report
    from .snapshot import probe, run_snapshot, today_utc
    from .tagger import run_tagging

    if args.cmd == "probe":
        df = probe(load_sources())
        print(df.to_string(index=False))
        (args.data_dir).mkdir(parents=True, exist_ok=True)
        df.to_json(args.data_dir / "probe.json", orient="records", indent=2)
        return 0

    if args.cmd == "snapshot":
        sources = load_sources()
        brands = [sources.by_key(k) for k in args.brand] if args.brand else None
        df, runs = run_snapshot(sources, date=args.date, data_dir=args.data_dir, brands=brands)
        print(runs.to_string(index=False))
        return 0 if (runs["status"] == "ok").any() else 1

    if args.cmd == "diff":
        events = run_diff(args.date or today_utc(), args.data_dir)
        print(events["event_type"].value_counts().to_string() if len(events) else "no events (first snapshot?)")
        return 0

    if args.cmd == "tag":
        tags = run_tagging(args.date or today_utc(), args.data_dir, use_claude=False if args.no_claude else None,
                           limit=args.limit)
        print(f"{len(tags)} products tagged")
        return 0

    if args.cmd == "report":
        path = write_report(args.date, args.data_dir, args.reports_dir)
        print(path)
        return 0

    if args.cmd == "profile":
        from .profile import write_profile

        path = write_profile(args.date, args.data_dir, args.reports_dir, use_claude=False if args.no_claude else None)
        print(path)
        return 0

    if args.cmd == "run-daily":
        date = args.date or today_utc()
        _, runs = run_snapshot(load_sources(), date=date, data_dir=args.data_dir)
        print(runs.to_string(index=False))
        if not (runs["status"] == "ok").any():
            log.error("no brand fetched successfully; not diffing")
            return 1
        events = run_diff(date, args.data_dir)
        print(events["event_type"].value_counts().to_string() if len(events) else "no events (first snapshot?)")
        tags = run_tagging(date, args.data_dir, use_claude=False if args.no_claude else None)
        print(f"{len(tags)} products tagged")
        return 0

    if args.cmd == "demo":
        from .demo import run_demo
        from .profile import write_profile

        dates = run_demo(args.data_dir, days=args.days, seed=args.seed)
        path = write_report(dates[-1], args.data_dir, args.reports_dir)
        prof = write_profile(dates[-1], args.data_dir, args.reports_dir, use_claude=False)
        print(f"{len(dates)} synthetic days written to {args.data_dir}; report: {path}; profile: {prof}")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
