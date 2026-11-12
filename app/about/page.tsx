import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About and data", description: "How Albion Transport calculates opportunities and handles market data." };

export default function AboutPage() {
  return <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <header><p className="text-sm font-bold uppercase tracking-wide text-emerald-700">Trust center</p><h1 className="mt-2 text-3xl font-semibold">About the calculations and data</h1><p className="mt-3 leading-7 text-slate-600">Albion Transport is an independent decision-support tool. It estimates opportunities; it does not guarantee that an order will still be available when you reach a market.</p></header>
    <Info title="Market data">Public observations come from the community-run Albion Online Data Project. Every calculation preserves timestamps and warns when a price is stale, missing, historical, or privately supplied. Missing prices are never silently treated as zero.</Info>
    <Info title="Profit calculations">Results include material cost, resource returns, station fees, sales tax, sell-order setup fees, focus cost, and the selected purchase and selling method. Quantities and carrying capacity remain first-class limits.</Info>
    <Info title="Private-first boundary">Private observations belong to the signed-in user and are not exposed through public endpoints. The app does not inspect game memory, intercept client traffic, automate input, or modify the Albion Online client.</Info>
    <Info title="Before acting">Check important prices and quantities in-game, especially when confidence is low or the result depends on a buy or sell order. Use the displayed source and freshness labels to judge risk.</Info>
    <div className="flex flex-wrap gap-3"><Link href="/coverage" className="primary-button">Check data coverage</Link><Link href="/privacy" className="secondary-button">Privacy information</Link></div>
  </main>;
}

function Info({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel rounded-lg p-5"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{children}</p></section>; }
