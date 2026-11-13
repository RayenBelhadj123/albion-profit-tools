import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { validatePublicCatalog } from "./portable-package-core.mjs";

// Deliberately select only public metadata. Never export users, observations,
// credentials, snapshots, profiles, plans, sessions, or imported/private prices.
if (!process.env.DATABASE_URL?.startsWith("postgres")) throw new Error("Set a direct PostgreSQL DATABASE_URL for the public metadata export.");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const items = (await client.query('SELECT "id", "name", "tier", "enchantment", "weightGrams" FROM "Item" ORDER BY "id"')).rows;
  const recipes = (await client.query('SELECT "id", "outputItemId", "outputQuantity", "nutritionRequired", "baseFocusCost" FROM "CraftRecipe" ORDER BY "id"')).rows;
  const ingredients = (await client.query('SELECT "id", "recipeId", "itemId", "quantity", "receivesReturn" FROM "CraftRecipeIngredient" ORDER BY "id"')).rows;
  const catalog = validatePublicCatalog({ formatVersion: 1, items, recipes, ingredients });
  const output = resolve(process.argv[2] || "output/portable-assets/public-catalog.json.gz");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, gzipSync(JSON.stringify(catalog), { level: 9 }));
  console.log(JSON.stringify({ output, items: items.length, recipes: recipes.length, ingredients: ingredients.length, tablesExported: ["Item", "CraftRecipe", "CraftRecipeIngredient"] }));
} finally { await client.end(); }
