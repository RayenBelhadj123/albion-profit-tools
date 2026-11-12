import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "albion-transport",
      defaultServer: env.ALBION_DEFAULT_SERVER,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
