import { afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

afterEach(() => vi.unstubAllEnvs());
function navPaths(mode: string | undefined): string[] {
  const source = readFileSync("app/components/site-nav.tsx", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, () => { props: { children: Array<{ props: { href: string } }> } }> = {};
  const jsx = (_type: unknown, props: unknown) => ({ props });
  vm.runInNewContext(code, { exports, process: { env: { NEXT_PUBLIC_PORTABLE_MODE: mode } }, require: (id: string) => {
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "next/navigation") return { usePathname: () => "/crafting" };
    if (id === "next/link") return { default: "a" };
    throw new Error(id);
  } });
  return exports.SiteNav().props.children.map((child) => child.props.href);
}
test("ordinary hosted redirects and two navigation links remain unchanged", async () => {
  vi.stubEnv("ALBION_PORTABLE_BUILD", "0");
  const config = (await import("../next.config")).default;
  expect((await config.redirects!()).map((r) => r.source)).toEqual(["/about", "/account", "/cooking", "/coverage", "/crafting", "/privacy", "/private-prices", "/refining", "/terms"]);
  expect(navPaths(undefined)).toEqual(["/black-market", "/market"]);
});
test("portable build exposes existing feature routes", async () => {
  vi.stubEnv("ALBION_PORTABLE_BUILD", "1");
  const config = (await import("../next.config")).default;
  expect(await config.redirects!()).toEqual([]);
});
test("portable navigation links to existing implemented pages only", () => {
  const paths = navPaths("1");
  expect(paths).toEqual(["/black-market", "/market", "/crafting", "/refining", "/cooking", "/coverage", "/private-prices", "/account"]);
  for (const path of paths) expect(() => readFileSync(`app${path}/page.tsx`)).not.toThrow();
});
