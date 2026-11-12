import type { Metadata } from "next";
import { MarketTools } from "@/app/components/market-tools";

export const metadata: Metadata = { title: "Market tools" };

export default function MarketToolsPage() {
  return <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <header><h1 className="text-3xl font-semibold tracking-tight">Public market lookup</h1><p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">Selected useful ideas from your Sundock tools, adapted to Albion Transport: targeted lookups, visible history, and private browser thresholds. No Prisma connection is needed for this page.</p></header>
    <MarketTools />
  </main>;
}
