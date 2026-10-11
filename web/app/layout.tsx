import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import CalibrationBanner from "@/components/CalibrationBanner";
import Nav from "@/components/Nav";
import { loadMeta } from "@/lib/data";
import { fmtDate, fmtDateTime, isoWeekLabel } from "@/lib/format";

// Every page reads data/export at build time; nothing is fetched at request time.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: {
    default: "Trendmonitor",
    template: "%s · Trendmonitor",
  },
  description:
    "Hvad kendetegner det udsolgte hos peers lige nu. Daglige snapshots af offentlige Shopify-kataloger, kun aggregater.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const meta = loadMeta();
  return (
    <html lang="da">
      <body className="min-h-screen font-sans">
        <Nav />
        <CalibrationBanner meta={meta} />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mt-10 border-t border-hair bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-4 text-xs text-muted">
            <span>
              Rapportdato {fmtDate(meta.report_date)} ({isoWeekLabel(meta.report_date)})
            </span>
            <span>Seneste snapshot {fmtDate(meta.latest_snapshot_date)}</span>
            <span>Taksonomi v{meta.taxonomy_version}</span>
            <span>Genereret {fmtDateTime(meta.generated_at)}</span>
            <span>Kun aggregater: ingen produkter, billeder eller salgstal.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
