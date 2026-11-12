"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto grid min-h-[55vh] max-w-3xl place-items-center px-4 py-12">
    <section className="panel grid justify-items-center gap-4 rounded-lg p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-700"><AlertTriangle aria-hidden="true" /></span>
      <div><h1 className="text-2xl font-semibold">This page could not be loaded</h1><p className="mt-2 text-sm leading-6 text-slate-600">Your saved data is unchanged. Try the page again; if market data is unavailable, wait briefly before rescanning.</p></div>
      <button className="primary-button" type="button" onClick={reset}><RotateCcw size={16} />Try again</button>
    </section>
  </main>;
}
