import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return <main className="mx-auto grid min-h-[55vh] max-w-3xl place-items-center px-4 py-12">
    <section className="panel grid justify-items-center gap-4 rounded-lg p-8 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">404</p>
      <div><h1 className="text-3xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-slate-600">The requested calculator or market page does not exist.</p></div>
      <Link className="primary-button" href="/"><ArrowLeft size={16} />Return to dashboard</Link>
    </section>
  </main>;
}
