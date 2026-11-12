export default function Loading() {
  return <main className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading page">
    <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
    <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-slate-200" />
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((value) => <div key={value} className="h-36 animate-pulse rounded-lg border border-slate-200 bg-white" />)}
    </div>
    <span className="sr-only">Loading Albion Transport…</span>
  </main>;
}
