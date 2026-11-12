"use client";

import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { AlbionItemIcon } from "@/app/components/albion-item-icon";

type QueueRow = {
  itemId: string; itemName: string; tier: number | null; city: string;
  orderType: "BUY" | "SELL"; status: "MISSING" | "STALE";
  lastPrice: string | null; lastObservedAt: string | null; ageMinutes: number | null;
  priority: number; reasons: string[];
};
type CoverageResult = {
  queue: QueueRow[]; expectedRows: number; freshRows: number; missingRows: number;
  staleRows: number; coverageBasisPoints: number; generatedAt: string;
};

export default function CoveragePage() {
  const [server, setServer] = useState("EUROPE");
  const [quality, setQuality] = useState("1");
  const [maxAgeMinutes, setMaxAgeMinutes] = useState("1440");
  const [city, setCity] = useState("ALL");
  const [data, setData] = useState<CoverageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visibleRows = useMemo(() => data?.queue.filter((row) => city === "ALL" || row.city === city) ?? [], [city, data]);

  async function analyze() {
    setLoading(true); setError(null); setCopied(false);
    try {
      const params = new URLSearchParams({ server, quality, maxAgeMinutes, limit: "500" });
      const response = await fetch(`/api/market-coverage?${params}`, { cache: "no-store" });
      const result = await response.json() as CoverageResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Coverage analysis failed.");
      setData(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Coverage analysis failed."); }
    finally { setLoading(false); }
  }

  async function copyQueue() {
    await navigator.clipboard.writeText([...new Set(visibleRows.map((row) => row.itemId))].join(","));
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section><h1 className="text-3xl font-semibold tracking-tight">Data Coverage</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Find the exact item and market combinations that need new Albion Data uploads. Black Market targets and crafting/refining recipes receive the highest priority.</p></section>
      <section className="panel grid gap-4 rounded-lg p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="field-label">Server<select className="field-input" value={server} onChange={(event) => setServer(event.target.value)}><option>EUROPE</option><option>AMERICAS</option><option>ASIA</option></select></label>
          <label className="field-label">Quality<select className="field-input" value={quality} onChange={(event) => setQuality(event.target.value)}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field-label">Freshness limit (minutes)<input className="field-input" type="number" min="1" max="10080" value={maxAgeMinutes} onChange={(event) => setMaxAgeMinutes(event.target.value)} /></label>
          <button className="primary-button self-end" disabled={loading} onClick={() => void analyze()}><RefreshCw className={loading ? "animate-spin" : ""} size={16} />{loading ? "Analyzing…" : "Analyze coverage"}</button>
        </div>
        <p className="text-xs text-slate-500">The queue checks origin sell prices in six royal cities and destination buy prices at the Black Market.</p>
        {error ? <p className="rounded bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}
      </section>

      {data ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Fresh coverage" value={`${(data.coverageBasisPoints / 100).toFixed(2)}%`} />
          <Metric label="Fresh rows" value={`${data.freshRows.toLocaleString()} / ${data.expectedRows.toLocaleString()}`} />
          <Metric label="Missing rows" value={data.missingRows.toLocaleString()} />
          <Metric label="Stale rows" value={data.staleRows.toLocaleString()} />
        </section>
        <section className="panel overflow-hidden rounded-lg">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div><h2 className="font-semibold">Priority collection queue</h2><p className="mt-1 text-xs text-slate-500">Open these items in the listed in-game market while the community client is running.</p></div>
            <div className="flex gap-2"><select className="field-input" value={city} onChange={(event) => setCity(event.target.value)}><option value="ALL">All markets</option>{["BLACK_MARKET","BRIDGEWATCH","CAERLEON","FORT_STERLING","LYMHURST","MARTLOCK","THETFORD"].map((value) => <option key={value}>{value}</option>)}</select><button className="secondary-button" onClick={() => void copyQueue()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy item IDs"}</button></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr>{["Priority","Item","Market side","Status","Last value","Age","Reason"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr className="border-t border-slate-100" key={`${row.itemId}-${row.city}-${row.orderType}`}><td className="px-4 py-3 font-semibold">{row.priority}</td><td className="px-4 py-3"><AlbionItemIcon itemId={row.itemId} quality={Number(quality)} size="sm" showLabel={false} /><span className="ml-2 inline-block"><span className="block font-semibold">{row.itemName}</span><span className="font-mono text-[11px] text-slate-500">{row.itemId}</span></span></td><td className="px-4 py-3">{row.city.replaceAll("_", " ")} · {row.orderType}</td><td className={`px-4 py-3 font-semibold ${row.status === "MISSING" ? "text-red-700" : "text-amber-700"}`}>{row.status}</td><td className="px-4 py-3">{row.lastPrice ? Number(row.lastPrice).toLocaleString() : "None"}</td><td className="px-4 py-3">{row.ageMinutes === null ? "Never" : `${row.ageMinutes.toLocaleString()} min`}</td><td className="px-4 py-3">{row.reasons.join(" · ")}</td></tr>)}</tbody></table></div>
        </section>
      </> : null}
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950"><strong>How to fill the queue:</strong> run the official community client, visit the listed city, then open the item and required buy or sell orders. Polling the API alone cannot create missing data. <a className="font-semibold underline" href="https://www.albion-online-data.com/client" target="_blank" rel="noreferrer">Get the community client</a>.</section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="panel rounded-lg p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
