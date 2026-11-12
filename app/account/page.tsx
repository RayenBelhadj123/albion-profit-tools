"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, ...(mode === "signup" ? { displayName } : {}) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Account request failed.");
      router.push("/"); router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Account request failed.");
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your player account"}</h1>
        <p className="mt-2 text-sm text-slate-600">Each account keeps its private prices, profiles, plans, and settings separate.</p>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          {mode === "signup" ? <label className="field-label">Display name<input className="field-input" required minLength={2} maxLength={50} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label> : null}
          <label className="field-label">Email<input className="field-input" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="field-label">Password<input className="field-input" required type="password" minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <p className="rounded bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}
          <button className="primary-button justify-center" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="mt-4 w-full text-sm font-semibold text-emerald-700" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}>{mode === "login" ? "Need an account? Sign up" : "Already registered? Sign in"}</button>
      </section>
    </main>
  );
}
