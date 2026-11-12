"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Upload } from "lucide-react";

const SAMPLE_CSV = `server,itemId,city,quality,orderType,price,quantity,observedAt,expiresAt,preferredOverride,note
EUROPE,T4_BAG,FORT_STERLING,1,SELL,1250,30,2026-08-11T09:30:00Z,,true,Checked in game`;

type Observation = {
  id: string; server: string; itemId: string; city: string; quality: number;
  orderType: string; price: string; availableQuantity: number | null;
  observedAt: string; source: string; preferredOverride: boolean;
};

export default function PrivatePricesPage() {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadObservations = useCallback(async () => {
    const response = await fetch("/api/private-market-observations", { cache: "no-store" });
    const result = await response.json() as { observations?: Observation[]; error?: string };
    if (response.ok) setObservations(result.observations ?? []);
    else setError(result.error ?? "Could not load private prices.");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/private-market-observations", { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() as { observations?: Observation[]; error?: string } }))
      .then(({ response, result }) => {
        if (cancelled) return;
        if (response.ok) setObservations(result.observations ?? []);
        else setError(result.error ?? "Could not load private prices.");
      });
    return () => { cancelled = true; };
  }, []);

  async function importCsv() {
    setLoading(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/private-market-observations", {
        method: "POST",
        headers: { "content-type": "text/csv; charset=utf-8" },
        body: csv,
      });
      const result = await response.json() as { imported?: number; error?: string; missingItemIds?: string[] };
      if (!response.ok) {
        const missing = result.missingItemIds?.length ? ` Missing: ${result.missingItemIds.join(", ")}` : "";
        throw new Error(`${result.error ?? "Import failed."}${missing}`);
      }
      setMessage(`Imported ${result.imported ?? 0} private observations.`);
      await loadObservations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import failed.");
    } finally { setLoading(false); }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 256 * 1024) { setError("CSV must be 256 KB or smaller."); return; }
    setCsv(await file.text()); setError(null); setMessage(`Loaded ${file.name}. Review it, then import.`);
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Private Prices</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Import observations exported as CSV from Excel or Google Sheets. Rows belong only to your signed-in account and can fill public-data gaps.</p>
      </section>

      <section className="panel grid gap-4 rounded-lg p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="secondary-button cursor-pointer"><Upload size={16} />Choose CSV<input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>
          <a className="secondary-button" href={templateHref} download="albion-private-prices-template.csv"><Download size={16} />Download template</a>
          <span className="text-xs text-slate-500">Maximum 500 rows and 256 KB per import.</span>
        </div>
        <label className="field-label">CSV data<textarea className="field-input min-h-64 font-mono text-xs" spellCheck={false} value={csv} onChange={(event) => setCsv(event.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="primary-button" type="button" disabled={loading || !csv.trim()} onClick={() => void importCsv()}>{loading ? "Importing…" : "Import private prices"}</button>
          <p className="text-xs text-slate-500">Use exact Albion item IDs. Dates should use ISO format with timezone.</p>
        </div>
        {message ? <p className="rounded bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{message}</p> : null}
        {error ? <p className="rounded bg-red-50 p-3 text-sm font-medium text-red-700">{error} {error.includes("Sign in") ? <Link className="underline" href="/account">Open account</Link> : null}</p> : null}
      </section>

      <section className="panel overflow-hidden rounded-lg">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Your recent observations</h2><p className="mt-1 text-xs text-slate-500">{observations.length} rows loaded for this account.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr>{["Item", "Market", "Side", "Quality", "Price", "Quantity", "Observed", "Source", "Override"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{observations.map((row) => <tr className="border-t border-slate-100" key={row.id}><td className="px-4 py-3 font-mono text-xs">{row.itemId}</td><td className="px-4 py-3">{row.server} · {row.city.replaceAll("_", " ")}</td><td className="px-4 py-3">{row.orderType}</td><td className="px-4 py-3">{row.quality}</td><td className="px-4 py-3 font-semibold">{Number(row.price).toLocaleString()}</td><td className="px-4 py-3">{row.availableQuantity?.toLocaleString() ?? "Unknown"}</td><td className="px-4 py-3">{new Date(row.observedAt).toLocaleString()}</td><td className="px-4 py-3">{row.source.replaceAll("_", " ")}</td><td className="px-4 py-3">{row.preferredOverride ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
      </section>
    </main>
  );
}
