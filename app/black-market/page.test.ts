import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sessions from "@/lib/market/scanner-session";
import * as views from "@/lib/market/scanner-view";
import * as fees from "@/lib/market/fees";
import * as queue from "@/lib/market/live-coverage-queue";
import * as reprice from "@/lib/transport/reprice-market-opportunity";

// A small hook/JSX driver executes the real page without adding browser deps.
// It checks effects and callbacks; parent Playwright QA checks real DOM/focus/layout.
type Node = { type: string | { name?: string }; props: Record<string, unknown> };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
function driver(fetcher: typeof fetch) {
  const slots: Slot[] = [];
  const document = { visibilityState: "visible", getElementById: () => null };
  const navigator = { onLine: true };
  let cursor = 0, dirty = true, tree: Node;
  let pending: Array<() => void> = [];
  const equal = (a?: unknown[], b?: unknown[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (factory: () => unknown, deps?: unknown[]) => {
    const i = cursor++;
    if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { value: factory(), deps };
    return slots[i].value;
  };
  const hooks = {
    useState(initial: unknown) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next: unknown) => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial: unknown) { return memo(() => ({ current: initial }), []); },
    useMemo: memo,
    useCallback(fn: unknown, deps?: unknown[]) { return memo(() => fn, deps); },
    useDeferredValue(value: unknown) { cursor++; return value; },
    useEffect(effect: () => (() => void) | undefined, deps?: unknown[]) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: effect() };
      });
    },
  };
  const jsx = (type: Node["type"], props: Node["props"]) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": {}, "@/app/components/albion-item-icon": {},
    "@/lib/market/scanner-session": sessions, "@/lib/market/scanner-view": views,
    "@/lib/market/fees": fees, "@/lib/market/live-coverage-queue": queue,
    "@/lib/transport/reprice-market-opportunity": reprice,
  };
  const source = process.env.SCANNER_TEST_BASELINE === "1"
    ? execFileSync("git", ["show", "HEAD:app/black-market/page.tsx"], { encoding: "utf8" })
    : readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { default?: () => Node } = {};
  vm.runInNewContext(code, {
    exports, require: (id: string) => {
      if (!(id in modules)) throw new Error(`Unexpected page dependency: ${id}`);
      return modules[id];
    },
    fetch: (url: string, init?: RequestInit) => url.startsWith("/api/items")
      ? Promise.resolve(Response.json({ count: 130, categories: ["Bags"], items: [] })) : fetcher(url, init),
    AbortController, URLSearchParams, TextDecoder, Date, Set, Map,
    window: { setTimeout, clearTimeout }, document, navigator,
  });
  const render = () => {
    for (let n = 0; dirty && n < 30; n++) {
      dirty = false; cursor = 0;
      tree = exports.default!();
      const effects = pending; pending = [];
      effects.forEach(effect => effect());
    }
    if (dirty) throw new Error("Page render did not settle");
  };
  const nodes = (predicate: (node: Node) => boolean) => {
    const found: Node[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== "object" || !("props" in value)) return;
      const node = value as Node;
      if (predicate(node)) found.push(node);
      walk(node.props.children);
    };
    walk(tree);
    return found;
  };
  const text = (value: unknown): string => Array.isArray(value) ? value.map(text).join("")
    : value && typeof value === "object" && "props" in value ? text((value as Node).props.children)
    : typeof value === "string" || typeof value === "number" ? String(value) : "";
  const change = (label: string, value: string | boolean) => {
    const parent = nodes(node => node.type === "label" && text(node).startsWith(label))[0];
    if (!parent) throw new Error(`Missing label: ${label}`);
    const inputs = (Array.isArray(parent.props.children) ? parent.props.children : [parent.props.children]) as Node[];
    const input = inputs.find(node => node?.type === "select" || node?.type === "input")!;
    (input.props.onChange as (event: unknown) => void)({ target: { value, checked: value } });
    render();
  };
  return {
    render, nodes, change, document, navigator,
    notices: () => nodes(node => node.type === "p" && node.props.className === "text-sm font-medium text-blue-700").map(text),
    async settle() { for (let i = 0; i < 30; i++) { await Promise.resolve(); render(); } },
    page() { return nodes(node => typeof node.type === "function" && node.type.name === "Pagination")[0]?.props.page; },
    nextPage() {
      const pager = nodes(node => typeof node.type === "function" && node.type.name === "Pagination")[0];
      (pager.props.onPageChange as (page: number) => void)(2); render();
    },
    rows() { return nodes(node => typeof node.type === "function" && node.type.name === "MobileOpportunityCard").map(node => node.props.item as views.Opportunity); },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

const rows = [1, 2, 5].flatMap(quality => Array.from({ length: 130 }, (_, i) => ({
  itemId: `T4_TEST_${i}`, itemName: `Test ${i}`, category: "Bags", quality,
  sourceCity: "BRIDGEWATCH", destinationCity: "Black Market", purchasePrice: "100000", expectedSalePrice: "200000",
  recommendedQuantity: 10, totalWeightGrams: 10000, investment: "1000000", grossRevenue: "2000000", marketValue: "2000000",
  taxes: "80000", setupFees: "0", netProfit: "920000", roiBasisPoints: 9200, profitPerKgSilver: 92000,
  sourcePriceAgeMinutes: 5, destinationPriceAgeMinutes: 5, score: 100, confidence: "MEDIUM", isProfitable: true,
  warnings: ["Quantity unknown"], purchasePriceSource: "PUBLIC", salePriceSource: "PUBLIC",
})));
const result = (opportunities = rows) => ({ opportunities, scannedAt: new Date().toISOString(), scannedItems: 130, scannedMarkets: 6, evaluatedRoutes: 390, freshPriceRows: 390 });
const stream = () => new Response(`${JSON.stringify({ type: "complete", data: result() })}\n`);
let ui: ReturnType<typeof driver>;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { ui?.dispose(); vi.useRealTimers(); });

describe("scanner page lifecycle", () => {
  it("keeps every quality local, reprices Premium immediately, and preserves valid pages", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(result()));
    ui = driver(fetcher); ui.render(); await ui.settle();
    ui.nextPage();
    const before = fetcher.mock.calls.length;
    ui.change("Item quality", "2"); await ui.settle();
    expect(ui.rows().every(row => row.quality === 2)).toBe(true);
    expect(ui.page()).toBe(2);
    ui.change("Premium status", "STANDARD"); await ui.settle();
    expect(ui.rows()[0]).toMatchObject({ taxes: "160000", netProfit: "840000", isProfitable: true });
    ui.change("Item quality", "5"); await ui.settle();
    expect(ui.rows()).toHaveLength(30);
    expect(fetcher.mock.calls.length).toBe(before);
    ui.change("Minimum silver profit", "84001"); await ui.settle();
    expect(ui.rows()).toHaveLength(0);
    expect(fetcher.mock.calls.length).toBe(before);
  });

  it("preserves pages and notices during background completion and reads latest selected IDs", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method !== "POST") return Response.json(result());
      const params = JSON.parse(init.body as string);
      const data = "rollingCursor" in params
        ? { ...result([]), rollingCoverage: { itemIds: [], nextCursor: "T4_CURSOR", totalItems: 130, completedItems: 50 } }
        : result(rows.filter(row => params.itemIds.split(",").includes(row.itemId)));
      return new Response(`${JSON.stringify({ type: "complete", data })}\n`);
    });
    ui = driver(fetcher); ui.render(); await ui.settle(); ui.nextPage();
    const notice = ui.notices();
    ui.change("Rolling coverage", true);
    await vi.advanceTimersByTimeAsync(0); await ui.settle();
    expect(ui.page()).toBe(2);
    expect(ui.notices()).toEqual(notice);
    const input = ui.nodes(node => node.type === "input" && node.props.placeholder === "T4_BAG,T5_BAG")[0];
    (input.props.onChange as (event: unknown) => void)({ target: { value: "T4_NEW" } }); ui.render();
    ui.change("Item quality", "2");
    const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000); await ui.settle();
    const second = JSON.parse(posts()[1][1]!.body as string);
    expect(second).toHaveProperty("rollingCursor", "");
    expect(ui.page()).toBe(2);
    await vi.advanceTimersByTimeAsync(5000); await ui.settle();
    for (let i = 0; i < 4; i++) { await vi.advanceTimersByTimeAsync(5000); await ui.settle(); }
    expect(posts().some(([, init]) => JSON.parse(init!.body as string).itemIds?.split(",").includes("T4_NEW"))).toBe(true);
    const count = posts().length;
    ui.document.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(5000); await ui.settle();
    expect(posts()).toHaveLength(count);
    ui.document.visibilityState = "visible"; ui.navigator.onLine = false;
    await vi.advanceTimersByTimeAsync(1000); await ui.settle();
    expect(posts()).toHaveLength(count);
  });

  it("invalidates an active manual scan on a cold market change, including late completion", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") return new Promise(resolve => { finish = resolve; });
      return String(url).includes("server=ASIA") ? new Response("{}", { status: 404 }) : Response.json(result());
    });
    ui = driver(fetcher); ui.render(); await ui.settle();
    const button = ui.nodes(node => node.type === "button" && String(node.props.className).includes("primary-button"))[0];
    (button.props.onClick as () => void)(); ui.render(); await ui.settle();
    ui.change("Server", "ASIA"); await ui.settle();
    expect(ui.rows()).toHaveLength(0);
    finish(stream()); await ui.settle();
    expect(ui.rows()).toHaveLength(0);
    const gets = fetcher.mock.calls.filter(([, init]) => !init?.method).length;
    ui.change("Server", "EUROPE"); await ui.settle();
    expect(ui.rows()).toHaveLength(100);
    expect(fetcher.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(gets);
  });

  it("releases a cancelled automatic request even when fetch has not settled", async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST"
      ? new Promise(resolve => { pending.push(resolve); }) : Response.json(result()));
    ui = driver(fetcher); ui.render(); await ui.settle();
    ui.change("Rolling coverage", true); await vi.advanceTimersByTimeAsync(0); await ui.settle();
    ui.change("Rolling coverage", false); await ui.settle();
    const button = ui.nodes(node => node.type === "button" && String(node.props.className).includes("primary-button"))[0];
    expect(button).toBeDefined();
    (button.props.onClick as () => void)(); ui.render(); await ui.settle();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")[0][1]?.signal?.aborted).toBe(true);
    pending[0](new Response(`${JSON.stringify({ type: "complete", data: result([]) })}\n`));
    await ui.settle();
    expect(ui.rows()).toHaveLength(100);
    expect(ui.nodes(node => node.type === "button" && String(node.props.className).includes("primary-button"))).toHaveLength(0);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")[1][1]?.signal?.aborted).toBe(false);
    pending[1](new Response(`${JSON.stringify({ type: "complete", data: result(rows.slice(0, 1)) })}\n`));
    await ui.settle();
    expect(ui.rows()).toHaveLength(1);
    expect(ui.nodes(node => node.type === "button" && String(node.props.className).includes("primary-button"))).toHaveLength(1);
  });
});
