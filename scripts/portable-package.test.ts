import { describe, expect, it } from "vitest";
import { isSafeBundleEntry, validatePublicCatalog } from "./portable-package-core.mjs";
import * as packageCore from "./portable-package-core.mjs";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

describe("portable package privacy boundaries", () => {
  it("excludes credentials, local state and private exports at every depth", () => {
    for (const file of [".env", "app/.env.production", "app/.env.example", "app/private.xlsx", "app/private.csv", "app/user.db", "app/logs/error.log", "app/.git/config"]) {
      expect(isSafeBundleEntry(file), file).toBe(false);
    }
    for (const file of ["app/server.js", "app/node_modules/@next/env/package.json", "runtime/node.exe", "app/.next/server/app/black-market.html"]) expect(isSafeBundleEntry(file), file).toBe(true);
  });
  it("copies license and notice texts, including compiled dependencies, without other package files", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR!, "portable-licenses-"));
    const source = join(root, "source"), target = join(root, "target");
    try {
      await mkdir(join(source, "dist", "compiled"), { recursive: true });
      await mkdir(join(source, "node_modules", "unrelated"), { recursive: true });
      await writeFile(join(source, "LICENSE.md"), "Package license");
      await writeFile(join(source, "dist", "compiled", "NOTICE"), "Compiled dependency notice");
      await writeFile(join(source, ".env"), "private");
      await writeFile(join(source, "index.js"), "not a license");
      await writeFile(join(source, "node_modules", "unrelated", "LICENSE"), "not a bundled dependency");
      await packageCore.copyLicenseTexts(source, target);
      expect(await readFile(join(target, "LICENSE.md"), "utf8")).toBe("Package license");
      expect(await readFile(join(target, "dist", "compiled", "NOTICE"), "utf8")).toBe("Compiled dependency notice");
      expect((await readdir(target)).sort()).toEqual(["LICENSE.md", "dist"]);
      await expect(readFile(join(target, "node_modules", "unrelated", "LICENSE"))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("assembles browser assets directly from the build and refuses missing JavaScript or CSS", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR!, "portable-browser-assets-"));
    const source = join(root, "source"), target = join(root, "app");
    try {
      await mkdir(source);
      await expect(packageCore.copyBrowserAssets(source, target)).rejects.toThrow(/browser|static/i);
      await mkdir(join(source, ".next", "static", "chunks"), { recursive: true });
      await writeFile(join(source, ".next", "static", "chunks", "app.js"), "window.hydrated=true");
      await expect(packageCore.copyBrowserAssets(source, target)).rejects.toThrow(/CSS|stylesheet/i);
      await writeFile(join(source, ".next", "static", "chunks", "app.css"), "body{color:black}");
      await mkdir(join(source, "public"));
      await writeFile(join(source, "public", "logo.svg"), "<svg/>");
      await writeFile(join(source, "public", "private.csv"), "must not be distributed");
      await packageCore.copyBrowserAssets(source, target);
      expect(await readFile(join(target, ".next", "static", "chunks", "app.js"), "utf8")).toBe("window.hydrated=true");
      expect(await readFile(join(target, ".next", "static", "chunks", "app.css"), "utf8")).toBe("body{color:black}");
      expect(await readFile(join(target, "public", "logo.svg"), "utf8")).toBe("<svg/>");
      await expect(readFile(join(target, "public", "private.csv"))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("accepts only explicitly public catalog tables and columns", () => {
    const publicCatalog = { formatVersion: 1, items: [{ id: "T4_BAG", name: "Bag", tier: 4, enchantment: 0, weightGrams: 3400 }], recipes: [], ingredients: [] };
    expect(validatePublicCatalog(publicCatalog)).toBe(publicCatalog);
    expect(() => validatePublicCatalog({ ...publicCatalog, users: [{ email: "private@example.invalid" }] })).toThrow();
    expect(() => validatePublicCatalog({ ...publicCatalog, items: [{ ...publicCatalog.items[0], passwordHash: "private" }] })).toThrow();
    expect(() => validatePublicCatalog({ ...publicCatalog, items: [] })).toThrow();
  });
});
