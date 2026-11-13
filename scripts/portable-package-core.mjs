import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export async function copyBrowserAssets(sourceRoot, appRoot) {
  const staticRoot = join(sourceRoot, ".next", "static");
  let assets;
  try { assets = await readdir(staticRoot, { recursive: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; throw new Error("Missing browser static assets. Build the application first."); }
  if (!assets.some(name => /\.js$/.test(name))) throw new Error("Missing browser JavaScript chunks.");
  if (!assets.some(name => /\.css$/.test(name))) throw new Error("Missing browser CSS stylesheet.");
  await cp(staticRoot, join(appRoot, ".next", "static"), { recursive: true, dereference: true,
    filter: source => isSafeBundleEntry(relative(staticRoot, source)) });
  const publicRoot = join(sourceRoot, "public");
  try {
    await cp(publicRoot, join(appRoot, "public"), { recursive: true, dereference: true,
      filter: source => isSafeBundleEntry(relative(publicRoot, source)) });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export async function copyLicenseTexts(source, destination) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === "node_modules" || !isSafeBundleEntry(entry.name)) continue;
    const from = join(source, entry.name), to = join(destination, entry.name);
    if (entry.isDirectory()) await copyLicenseTexts(from, to);
    else if (entry.isFile() && /^(?:licen[sc]e|notice|copying)(?:[.-].*)?$/i.test(entry.name)) {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to);
    }
  }
}

const columns = {
  items: ["id", "name", "tier", "enchantment", "weightGrams"],
  recipes: ["id", "outputItemId", "outputQuantity", "nutritionRequired", "baseFocusCost"],
  ingredients: ["id", "recipeId", "itemId", "quantity", "receivesReturn"],
};

export function isSafeBundleEntry(relativePath) {
  const parts = relativePath.replaceAll("\\", "/").split("/");
  return !parts.some(part => /^\.env(?:\.|$)/i.test(part) || [".git", ".codex-tmp", "logs"].includes(part)) &&
    !/\.(?:csv|xlsx?|sqlite3?|db|log|pem|key)$/i.test(parts.at(-1));
}

export function validatePublicCatalog(value) {
  if (!value || typeof value !== "object" || value.formatVersion !== 1 ||
      Object.keys(value).some(key => !["formatVersion", ...Object.keys(columns)].includes(key))) throw new Error("Invalid public catalog format");
  for (const [table, allowed] of Object.entries(columns)) {
    if (!Array.isArray(value[table])) throw new Error(`Missing public table: ${table}`);
    const ids = new Set();
    for (const row of value[table]) {
      if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.id || ids.has(row.id) ||
          Object.keys(row).some(key => !allowed.includes(key))) throw new Error(`Non-public or invalid catalog row in ${table}`);
      ids.add(row.id);
    }
  }
  if (!value.items.length) throw new Error("Public item catalog is empty");
  return value;
}
