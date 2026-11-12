import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";

export async function AuthStatus() {
  const user = await getCurrentUser();
  if (!user) {
    return <Link className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800" href="/account">Sign in</Link>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-right text-xs"><span className="block font-semibold">{user.displayName ?? "Player"}</span><span className="block text-slate-500">{user.email}</span></span>
      <form action="/api/auth/logout" method="post"><button className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50" type="submit">Sign out</button></form>
    </div>
  );
}
