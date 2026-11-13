import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { copyBrowserAssets, copyLicenseTexts, isSafeBundleEntry, validatePublicCatalog } from "./portable-package-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  node: { type: "string" }, "node-license": { type: "string" },
  catalog: { type: "string", default: "output/portable-assets/public-catalog.json.gz" },
  output: { type: "string", default: "output/windows/AlbionTransport" },
} });
const output = resolve(root, values.output);
const allowedRoot = resolve(root, "output");
if (!output.startsWith(allowedRoot + sep)) throw new Error("Package output must be inside this project's output directory.");
if (!values.node || !values["node-license"]) throw new Error("Supply --node and --node-license from the verified official Windows Node.js release.");
try { await stat(output); throw new Error("Output already exists. Choose a new output folder; existing releases are never deleted automatically."); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const routes = JSON.parse(await readFile(resolve(root, ".next/routes-manifest.json"), "utf8"));
if (routes.redirects.some(route => route.source === "/account" || route.source === "/crafting")) throw new Error("Run ALBION_PORTABLE_BUILD=1 NEXT_PUBLIC_PORTABLE_MODE=1 npm run build first.");
const catalogFile = resolve(root, values.catalog);
const catalog = validatePublicCatalog(JSON.parse(gunzipSync(await readFile(catalogFile)).toString("utf8")));
const nodeBytes = await readFile(resolve(values.node));
const nodeSha = createHash("sha256").update(nodeBytes).digest("hex");
// SHA-256 from the official v22.23.5/SHASUMS256.txt, entry win-x64/node.exe.
if (nodeSha !== "247e9693d316da9857e44990e5e11709f596f18112251b8026ec6eed80bdf38a") throw new Error("Windows Node binary does not match the verified v22.23.5 release.");
await mkdir(output, { recursive: true });
await cp(resolve(root, ".next/standalone"), resolve(output, "app"), {
  recursive: true, dereference: true,
  filter: source => isSafeBundleEntry(relative(resolve(root, ".next/standalone"), source)),
});
await copyBrowserAssets(root, resolve(output, "app"));
await mkdir(resolve(output, "runtime"), { recursive: true });
await writeFile(resolve(output, "runtime/node.exe"), nodeBytes);
for (const file of ["package.json", "package-lock.json", "node_modules"]) {
  await cp(resolve(root, "portable/runtime", file), resolve(output, "runtime", file), {
    recursive: true, dereference: true,
    filter: source => isSafeBundleEntry(relative(resolve(root, "portable/runtime"), source)),
  });
}
await mkdir(resolve(output, "portable"), { recursive: true });
for (const entry of await readdir(resolve(root, "portable"))) {
  if (entry.endsWith(".mjs")) await cp(resolve(root, "portable", entry), resolve(output, "portable", entry));
}
for (const file of ["START-ALBION.bat", "STOP-ALBION.bat", "README.txt"]) await cp(resolve(root, file), resolve(output, file));
await mkdir(resolve(output, "data"), { recursive: true });
await cp(resolve(root, "prisma/migrations"), resolve(output, "data/migrations"), { recursive: true });
await cp(catalogFile, resolve(output, "data/public-catalog.json.gz"));
await mkdir(resolve(output, "licenses"), { recursive: true });
await cp(resolve(values["node-license"]), resolve(output, "licenses/NODE-LICENSE.txt"));
// Next's traced standalone output omits license texts: retain them explicitly.
const bundledModules = resolve(output, "app/node_modules");
async function retainAppLicenses(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) await retainAppLicenses(full);
    else if (entry.name === "package.json") {
      const packagePath = relative(bundledModules, dirname(full));
      await copyLicenseTexts(resolve(root, "node_modules", packagePath), resolve(output, "licenses/app", packagePath));
    }
  }
}
await retainAppLicenses(bundledModules);
await writeFile(resolve(output, "licenses/README.txt"), "Node.js license is included here. Application dependency license and notice texts are retained under licenses/app; PGlite runtime dependency licenses remain in runtime/node_modules. Game data/artwork belongs to its respective owners. This is an independent community tool.\n");

const files = {};
async function inventory(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) await inventory(full);
    else {
      const name = relative(output, full).replaceAll("\\", "/");
      if (!isSafeBundleEntry(name)) throw new Error(`Private/local artifact in bundle: ${name}`);
      const bytes = await readFile(full);
      files[name] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    }
  }
}
await inventory(output);
const manifest = {
  product: "Albion Transport", target: "Windows 10/11 x64", node: "22.23.5",
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  workingTreeModified: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  buildId: (await readFile(resolve(root, ".next/BUILD_ID"), "utf8")).trim(),
  createdAt: new Date().toISOString(),
  publicCatalog: { items: catalog.items.length, recipes: catalog.recipes.length, ingredients: catalog.ingredients.length },
  privateDatabaseIncluded: false, installedNodeRequired: false, installedPostgresRequired: false,
  freshMarketDataRequiresInternet: true, files,
};
await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, files: Object.keys(files).length, totalBytes: Object.values(files).reduce((n, row) => n + row.bytes, 0), publicCatalog: manifest.publicCatalog, nodeSha256: nodeSha }, null, 2));
