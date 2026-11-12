import { inspectMarket, marketInspectionSchema } from "@/lib/albion/market-inspector";
import { jsonResponse } from "@/lib/api/json";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = marketInspectionSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonResponse({ error: "Choose a valid item ID, server, city, and quality.", issues: parsed.error.issues }, { status: 400 });
  try {
    const data = await inspectMarket({ ...parsed.data, history: String(parsed.data.history) }, { signal: request.signal });
    if (data.currentError && (!parsed.data.history || data.historyError)) {
      return jsonResponse({ error: data.currentError }, { status: 502 });
    }
    return jsonResponse(data);
  } catch {
    return jsonResponse({ error: request.signal.aborted ? "Lookup cancelled." : "Public market lookup failed. Please retry." }, { status: request.signal.aborted ? 499 : 502 });
  }
}
