import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/prisma", () => { throw new Error("Market tools must not access Prisma."); });
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("public market inspector API", () => {
  it("works without a database and never caches responses in a shared HTTP cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/market-inspector?itemId=T4_BAG&history=false"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ itemId: "T4_BAG", listing: null, history: [] });
  });
  it("rejects invalid input and private alert thresholds without making upstream calls", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { GET } = await import("./route");
    for (const query of ["itemId=../secret", "itemId=T4_BAG&threshold=25000", "itemId=T4_BAG&quality=9"]) {
      expect((await GET(new Request(`http://localhost/api/market-inspector?${query}`))).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns an actionable upstream failure rather than a Prisma or HTML error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("limited", { status: 429 })));
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/market-inspector?itemId=T4_BAG"));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/rate limit/);
  });
});
