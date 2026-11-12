"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Bell, RefreshCw, Search, Trash2 } from "lucide-react";
import { INSPECTOR_CITIES, marketInspectionSchema, type MarketInspection, type MarketSelection } from "@/lib/albion/market-inspector";
import { describePriceFreshness, evaluatePriceAlert, localAlertSchema, LOCAL_ALERTS_KEY, parseLocalAlerts, type LocalPriceAlert, type PriceAlertResult } from "@/lib/market/local-price-alerts";

const initialSelection: MarketSelection = { itemId: "T4_BAG", server: "EUROPE", city: "Bridgewatch", quality: 1 };
const money = (value: string | null | undefined) => value ? BigInt(value).toLocaleString() : "Not reported";
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Unknown observation time";

async function lookup(selection: MarketSelection, history: boolean, signal?: AbortSignal): Promise<MarketInspection> {
  // Only public lookup coordinates leave the browser: never thresholds or notes.
  const params = new URLSearchParams({ itemId: selection.itemId, server: selection.server, city: selection.city, quality: String(selection.quality), history: String(history) });
  const response = await fetch(`/api/market-inspector?${params}`, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Public market lookup failed. Try again.");
  return body as MarketInspection;
}

export function MarketTools() {
  const [selection, setSelection] = useState<MarketSelection>(initialSelection);
  const [result, setResult] = useState<MarketInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<LocalPriceAlert[]>([]);
  const [checks, setChecks] = useState<Record<string, PriceAlertResult | { state: "ERROR"; message: string }>>({});
  const [checking, setChecking] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<"BELOW" | "ABOVE">("BELOW");
  const [side, setSide] = useState<"SELL" | "BUY">("SELL");
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alertController = useRef<AbortController | null>(null);

  useEffect(() => {
    try { setAlerts(parseLocalAlerts(localStorage.getItem(LOCAL_ALERTS_KEY))); }
    catch { setStorageNotice("Browser storage is unavailable. Alerts cannot be saved on this device."); }
    setStorageLoaded(true);
    return () => { controller.current?.abort(); alertController.current?.abort(); };
  }, []);

  function persist(next: LocalPriceAlert[]) {
    try {
      localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(next));
      setAlerts(next);
      setStorageNotice("Alerts saved only in this browser.");
    } catch { setStorageNotice("Could not save alerts. Check your browser storage settings."); }
  }

  async function refresh(event: FormEvent) {
    event.preventDefault();
    const parsed = marketInspectionSchema.safeParse(selection);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the selected item."); return; }
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setLoading(true); setError(null); setResult(null);
    try { const data = await lookup(selection, true, current.signal); if (!current.signal.aborted) setResult(data); }
    catch (failure) { if (!current.signal.aborted) setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "Cannot reach this app. Check that the local server is running, then retry."); }
    finally { if (controller.current === current) setLoading(false); }
  }

  function saveAlert(event: FormEvent) {
    event.preventDefault();
    if (alerts.length >= 20) { setStorageNotice("Keep at most 20 alerts. Remove one before adding another."); return; }
    const parsed = localAlertSchema.safeParse({ ...selection, id: crypto.randomUUID(), threshold, direction, side, maxAgeMinutes: 60 });
    if (!parsed.success) { setStorageNotice("Use a valid item ID and a whole-silver threshold from 1 to 999,999,999,999."); return; }
    persist([...alerts, parsed.data]);
  }

  async function checkAlerts() {
    if (checking) return;
    const current = new AbortController(); alertController.current = current;
    setChecking(true); setChecks({});
    for (const alert of alerts) {
      if (current.signal.aborted) break;
      try {
        const data = await lookup(alert, false, current.signal);
        if (data.currentError) throw new Error(data.currentError);
        if (!current.signal.aborted) setChecks(previous => ({ ...previous, [alert.id]: evaluatePriceAlert(alert, data.listing) }));
      } catch (failure) {
        if (!current.signal.aborted) setChecks(previous => ({ ...previous, [alert.id]: { state: "ERROR", message: failure instanceof Error ? failure.message : "Lookup unavailable" } }));
      }
      // Bound demand on the public service; alerts never run a background timer.
      if (!current.signal.aborted) await new Promise(resolve => window.setTimeout(resolve, 750));
    }
    if (!current.signal.aborted) setChecking(false);
  }

  const maximum = result?.history.reduce((max, point) => Math.max(max, Number(point.averagePrice)), 0) ?? 0;
  const trend = result?.trend;
  const TrendIcon = trend?.direction === "UP" ? ArrowUp : trend?.direction === "DOWN" ? ArrowDown : ArrowRight;

  return <section className="panel grid gap-6 rounded-lg p-5 sm:p-6" aria-labelledby="market-tools-heading">
    <header>
      <h2 id="market-tools-heading" className="text-xl font-semibold">Market tools</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">Check one item without a full scan or a database connection. Prices and completed-sale history come from public player reports, not guaranteed orders.</p>
    </header>
    <form onSubmit={refresh} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="field-label">Item ID<input className="field-input font-mono" value={selection.itemId} maxLength={100} pattern="[A-Z0-9_@]+" onChange={event => setSelection({ ...selection, itemId: event.target.value })} placeholder="T4_BAG" required /></label>
      <label className="field-label">Market server<select className="field-input" value={selection.server} onChange={event => setSelection({ ...selection, server: event.target.value as MarketSelection["server"] })}><option value="EUROPE">Europe</option><option value="AMERICAS">Americas</option><option value="ASIA">Asia</option></select></label>
      <label className="field-label">Market city<select className="field-input" value={selection.city} onChange={event => setSelection({ ...selection, city: event.target.value as MarketSelection["city"] })}>{INSPECTOR_CITIES.map(city => <option key={city}>{city}</option>)}</select></label>
      <label className="field-label">Market quality<select className="field-input" value={selection.quality} onChange={event => setSelection({ ...selection, quality: Number(event.target.value) })}>{["Normal", "Good", "Outstanding", "Excellent", "Masterpiece"].map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select></label>
      <button className="primary-button" disabled={loading} type="submit">{loading ? <RefreshCw className="animate-spin motion-reduce:animate-none" size={16} /> : <Search size={16} />}{loading ? "Checking public data…" : "Check prices & history"}</button>
    </form>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {result ? <div className="grid gap-5" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-3"><h3 className="font-semibold">{result.itemId} · {result.city} · {result.server} · quality {result.quality}</h3><span className="text-xs text-slate-500">Lookup {timestamp(result.fetchedAt)}</span></div>
      {result.currentError ? <p className="text-sm text-amber-800">{result.currentError} History below is separate from current orders.</p> : null}
      <dl className="grid gap-5 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-600">Lowest sell order</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{money(result.listing?.lowestSell)}</dd><dd className="mt-1 text-xs font-semibold text-slate-700">{result.listing?.lowestSell ? describePriceFreshness(result.listing.sellObservedAt, new Date(result.fetchedAt)) : "Price unavailable"}</dd><dd className="mt-1 text-xs text-slate-500">Observed {timestamp(result.listing?.sellObservedAt)}</dd></div>
        <div><dt className="text-sm text-slate-600">Highest buy order</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{money(result.listing?.highestBuy)}</dd><dd className="mt-1 text-xs font-semibold text-slate-700">{result.listing?.highestBuy ? describePriceFreshness(result.listing.buyObservedAt, new Date(result.fetchedAt)) : "Price unavailable"}</dd><dd className="mt-1 text-xs text-slate-500">Observed {timestamp(result.listing?.buyObservedAt)}</dd></div>
      </dl>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Daily sale history</h3><span className="inline-flex items-center gap-1 text-sm font-medium"><TrendIcon size={16} />{trend?.direction === "INSUFFICIENT" ? "Not enough history for a trend" : `${trend?.direction === "UP" ? "Rising" : trend?.direction === "DOWN" ? "Falling" : "Stable"} · ${((trend?.changeBasisPoints ?? 0) / 100).toFixed(1)}%`}</span></div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Last seven days; gaps are not filled with invented prices. Trend needs three observations and is not a forecast.{result.historyFromCache ? " History reused from a short-lived public cache." : ""}</p>
        {result.historyError ? <p className="mt-3 text-sm text-amber-800">{result.historyError}</p> : null}
        {result.history.length ? <>
          <div className="mt-5 flex h-40 items-end gap-2 border-b border-slate-300" role="img" aria-label="Daily average sale prices; exact values are in the table below">{result.history.map(point => <div key={point.timestamp} className="flex h-full min-w-0 flex-1 items-end" title={`${point.timestamp.slice(0, 10)}: ${money(point.averagePrice)} silver`}><div className="w-full rounded-t-sm bg-emerald-700" style={{ height: `${Math.max(2, Number(point.averagePrice) / maximum * 100)}%` }} /></div>)}</div>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm tabular-nums"><caption className="sr-only">Daily completed-sale observations</caption><thead className="border-b border-slate-200 text-slate-600"><tr><th scope="col" className="py-2 pr-4">Date (UTC)</th><th scope="col" className="py-2 pr-4 text-right">Average silver</th><th scope="col" className="py-2 text-right">Items sold</th></tr></thead><tbody>{result.history.map(point => <tr key={point.timestamp} className="border-b border-slate-100"><td className="py-2 pr-4">{point.timestamp.slice(0, 10)}</td><td className="py-2 pr-4 text-right">{money(point.averagePrice)}</td><td className="py-2 text-right">{point.itemCount.toLocaleString()}</td></tr>)}</tbody></table></div>
        </> : <p className="mt-4 text-sm text-slate-500">No completed-sale history was reported for this selection.</p>}
      </div>
    </div> : !loading ? <p className="text-sm text-slate-500">Choose an item ID, city, server, and quality, then check its public prices.</p> : <p role="status" className="text-sm text-slate-600">Loading only this item’s prices and daily history…</p>}
    <section className="border-t border-slate-200 pt-5" aria-labelledby="local-alerts-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="local-alerts-heading" className="inline-flex items-center gap-2 font-semibold"><Bell size={17} />Local price alerts</h3><button className="secondary-button" type="button" disabled={!alerts.length || checking} onClick={() => void checkAlerts()}>{checking ? "Checking alerts…" : "Check saved alerts"}</button></div>
      <p className="mt-2 max-w-prose text-xs leading-5 text-slate-600">Thresholds stay in this browser, not in the database or GitHub. The selected public item/city is sent only when checked. No background notifications. Anyone using this browser can see saved alerts.</p>
      <form className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={saveAlert}>
        <label className="field-label">Order side<select className="field-input" value={side} onChange={event => setSide(event.target.value as "SELL" | "BUY")}><option value="SELL">Lowest sell</option><option value="BUY">Highest buy</option></select></label>
        <label className="field-label">Alert condition<select className="field-input" value={direction} onChange={event => setDirection(event.target.value as "BELOW" | "ABOVE")}><option value="BELOW">Below threshold</option><option value="ABOVE">Above threshold</option></select></label>
        <label className="field-label">Threshold (silver)<input className="field-input" inputMode="numeric" pattern="[1-9][0-9]{0,11}" value={threshold} onChange={event => setThreshold(event.target.value)} placeholder="25000" required /></label>
        <button type="submit" className="secondary-button" disabled={!storageLoaded || checking}>Save alert for selected item</button>
      </form>
      {storageNotice ? <p role="status" className="mt-3 text-sm text-slate-600">{storageNotice}</p> : null}
      <ul className="mt-4 divide-y divide-slate-200">{alerts.map(alert => {
        const check = checks[alert.id];
        return <li key={alert.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><span className="break-all font-mono font-semibold">{alert.itemId}</span><span className="ml-2 text-slate-600">{alert.server} · {alert.city} · Q{alert.quality}</span><p className="mt-1 text-slate-600">{alert.side === "SELL" ? "Lowest sell" : "Highest buy"} {alert.direction.toLowerCase()} {money(alert.threshold)} silver · max age {alert.maxAgeMinutes} min</p><p className={`mt-1 text-xs ${check?.state === "TRIGGERED" ? "font-semibold text-emerald-800" : "text-slate-500"}`}>{!check ? "Not checked this session" : check.state === "ERROR" ? check.message : `${check.state === "TRIGGERED" ? "Threshold reached" : check.state === "WAITING" ? "Threshold not reached" : check.state === "STALE" ? "Stale observation — no alert" : "Missing price or timestamp — no alert"}${check.price ? ` · ${money(check.price)} silver` : ""}`}</p></div><button type="button" className="secondary-button" disabled={checking} aria-label={`Remove alert for ${alert.itemId}`} onClick={() => persist(alerts.filter(row => row.id !== alert.id))}><Trash2 size={14} />Remove</button></li>;
      })}</ul>
      {!alerts.length && storageLoaded ? <p className="mt-4 text-sm text-slate-500">No local alerts saved. Add a threshold for the selection above.</p> : null}
    </section>
  </section>;
}
