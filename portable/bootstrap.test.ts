import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const requireRuntime = createRequire(resolve("portable/runtime/package.json"));
const { PGlite } = requireRuntime("@electric-sql/pglite");
const modulePath = "./bootstrap.mjs";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  if (!process.env.TMPDIR) throw new Error("Set TMPDIR to a workspace scratch directory for portable tests");
  await mkdir(process.env.TMPDIR, { recursive: true });
  const root = await mkdtemp(join(process.env.TMPDIR, "bootstrap spaces "));
  roots.push(root);
  await cp(resolve("prisma/migrations"), join(root, "migrations"), { recursive: true });
  const catalog = { formatVersion: 1,
    items: [{ id: "T4_TEST", name: "O'Brien test", tier: 4, enchantment: 0, weightGrams: null }],
    recipes: [{ id: "recipe", outputItemId: "T4_TEST", outputQuantity: 1, nutritionRequired: null, baseFocusCost: null }],
    ingredients: [{ id: "ingredient", recipeId: "recipe", itemId: "T4_TEST", quantity: 2, receivesReturn: true }] };
  const catalogPath = join(root, "public-catalog.json.gz");
  await writeFile(catalogPath, gzipSync(JSON.stringify(catalog)));
  return { root, migrationDir: join(root, "migrations"), catalogPath };
}

test("real bundled migrations and offline catalog persist exactly once without touching private rows", async () => {
  const { bootstrap } = await import(modulePath);
  const options = await fixture();
  let db = await PGlite.create(join(options.root, "db"));
  try {
    expect(await bootstrap(db, options)).toBe(1);
    expect((await db.query('SELECT count(*)::int AS count FROM "PortableMigration"')).rows[0].count).toBe(5);
    expect((await db.query('SELECT name, "weightGrams" FROM "Item"')).rows[0]).toEqual({ name: "O'Brien test", weightGrams: null });
    await db.exec(`INSERT INTO "User" (id, "displayName", "updatedAt") VALUES ('synthetic-user', 'marker', now());
      INSERT INTO "PrivateMarketObservation" (id,"userId","itemId",server,city,quality,"orderType",price,"observedAt","updatedAt")
      VALUES ('synthetic-private','synthetic-user','T4_TEST','EUROPE','CAERLEON',1,'BUY',123,now(),now());`);
  } finally { await db.close(); }
  db = await PGlite.create(join(options.root, "db"));
  try {
    expect(await bootstrap(db, options)).toBe(1);
    expect((await db.query('SELECT price::int FROM "PrivateMarketObservation"')).rows).toEqual([{ price: 123 }]);
    expect((await db.query('SELECT "displayName" FROM "User"')).rows).toEqual([{ displayName: "marker" }]);
    const path = join(options.migrationDir, "20260806165318_init/migration.sql");
    await writeFile(path, (await readFile(path, "utf8")) + "\n-- changed");
    await expect(bootstrap(db, options)).rejects.toThrow(/checksum/i);
    expect((await db.query('SELECT count(*)::int AS count FROM "User"')).rows[0].count).toBe(1);
  } finally { await db.close(); }
}, 60_000);

test("failed migration rolls back its schema and metadata; malformed catalog is refused", async () => {
  const { bootstrap } = await import(modulePath);
  const options = await fixture();
  await mkdir(join(options.migrationDir, "999_failed"));
  await writeFile(join(options.migrationDir, "999_failed/migration.sql"), 'CREATE TABLE rollback_marker(id int); SELECT missing_column;');
  const db = await PGlite.create(join(options.root, "db"));
  try {
    await expect(bootstrap(db, options)).rejects.toThrow();
    expect((await db.query("SELECT to_regclass('rollback_marker') AS name")).rows[0].name).toBeNull();
    expect((await db.query('SELECT count(*)::int AS count FROM "PortableMigration"')).rows[0].count).toBe(5);
    await rm(join(options.migrationDir, "999_failed"), { recursive: true });
    await writeFile(options.catalogPath, gzipSync(JSON.stringify({ formatVersion: 1, items: [], recipes: [], ingredients: [], users: [{ id: "forbidden" }] })));
    await expect(bootstrap(db, options)).rejects.toThrow(/catalog/i);
  } finally { await db.close(); }
}, 60_000);
