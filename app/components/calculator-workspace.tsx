import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, Database, LoaderCircle } from "lucide-react";

export const ALBION_CITIES = [
  "Bridgewatch",
  "Caerleon",
  "Fort Sterling",
  "Lymhurst",
  "Martlock",
  "Thetford",
] as const;

export function CalculatorSection({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel overflow-hidden rounded-lg">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
      <div><h2 className="font-semibold text-slate-950">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}</div>
      {action}
    </header>
    <div className="p-4 sm:p-5">{children}</div>
  </section>;
}

export function CalculatorField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field-label">{label}<span className="[&>input]:field-input [&>select]:field-input">{children}</span>{hint ? <span className="text-[11px] font-normal leading-4 text-slate-500">{hint}</span> : null}</label>;
}

export function CalculatorCity({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <CalculatorField label={label}><select value={value} onChange={(event) => onChange(event.target.value)}>{ALBION_CITIES.map((city) => <option key={city}>{city}</option>)}</select></CalculatorField>;
}

export function AdvancedSettings({ title = "Advanced settings", summary, children }: { title?: string; summary?: string; children: ReactNode }) {
  return <details className="group rounded-lg border border-slate-200 bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800 marker:hidden">
      <span>{title}{summary ? <span className="ml-2 font-normal text-slate-500">{summary}</span> : null}</span>
      <ChevronDown className="transition-transform group-open:rotate-180" size={17} aria-hidden="true" />
    </summary>
    <div className="border-t border-slate-200 p-4">{children}</div>
  </details>;
}

export function CalculatorStatus({ loading, error, emptyText }: { loading?: boolean; error?: string | null; emptyText?: string }) {
  if (error) return <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" /><span>{error}</span></div>;
  if (loading) return <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" />Refreshing prices and calculating...</div>;
  if (emptyText) return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{emptyText}</div>;
  return null;
}

export function PriceSource({ source, ageMinutes }: { source: string | null; ageMinutes?: number | null }) {
  const missing = !source;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${missing ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}><Database size={11} aria-hidden="true" />{source?.replaceAll("_", " ").toLowerCase() ?? "missing"}{ageMinutes !== undefined ? ` · ${formatAge(ageMinutes)}` : ""}</span>;
}

function formatAge(minutes: number | null) {
  if (minutes === null) return "unknown age";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1_440)}d`;
}
