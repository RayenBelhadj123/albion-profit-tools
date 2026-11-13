import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const checksum = (value) => createHash('sha256').update(value).digest('hex');

function validateCatalog(catalog) {
  const integer = (value, nullable = false) => (nullable && value === null) || (Number.isSafeInteger(value) && value >= 0);
  const text = (value) => typeof value === 'string' && value.length > 0;
  if (!catalog || catalog.formatVersion !== 1 ||
      Object.keys(catalog).some((key) => !['formatVersion', 'items', 'recipes', 'ingredients'].includes(key)) ||
      !Array.isArray(catalog.items) || !catalog.items.length || !Array.isArray(catalog.recipes) || !Array.isArray(catalog.ingredients) ||
      !catalog.items.every((i) => text(i.id) && (i.name === null || typeof i.name === 'string') && integer(i.tier, true) && integer(i.enchantment) && integer(i.weightGrams, true)) ||
      !catalog.recipes.every((r) => text(r.id) && text(r.outputItemId) && integer(r.outputQuantity) && r.outputQuantity > 0 && integer(r.nutritionRequired, true) && integer(r.baseFocusCost, true)) ||
      !catalog.ingredients.every((i) => text(i.id) && text(i.recipeId) && text(i.itemId) && integer(i.quantity) && i.quantity > 0 && typeof i.receivesReturn === 'boolean')) {
    throw new Error('Invalid bundled public catalog. Re-extract the complete portable archive.');
  }
}

// Only these public columns are imported; all values cross a parameter boundary.
export async function bootstrap(db, { migrationDir, catalogPath }) {
  const entries = await readdir(migrationDir, { withFileTypes: true });
  const migrations = await Promise.all(entries.filter((e) => e.isDirectory()).map(async ({ name: id }) => {
    const sql = await readFile(join(migrationDir, id, 'migration.sql'), 'utf8');
    return { id, sql, hash: checksum(sql) };
  }));
  migrations.sort((a, b) => a.id.localeCompare(b.id));
  if (!migrations.length) throw new Error('Bundled migrations are missing. Re-extract the complete archive.');
  await db.exec(`CREATE TABLE IF NOT EXISTS "PortableMigration" (id text PRIMARY KEY, checksum text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "PortableCatalog" (version integer PRIMARY KEY, checksum text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now());`);
  const applied = (await db.query('SELECT id, checksum FROM "PortableMigration"')).rows;
  for (const row of applied) {
    if (!migrations.some((m) => m.id === row.id && m.hash === row.checksum)) {
      throw new Error(`Migration checksum mismatch or missing migration: ${row.id}. Keep your data and restore the matching archive.`);
    }
  }
  for (const migration of migrations) {
    if (applied.some((row) => row.id === migration.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query('INSERT INTO "PortableMigration" (id, checksum) VALUES ($1, $2)', [migration.id, migration.hash]);
    });
  }
  if (!(await db.query('SELECT version FROM "PortableCatalog" WHERE version = 1')).rows.length) {
    const bytes = await readFile(catalogPath);
    const catalog = JSON.parse(gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8'));
    validateCatalog(catalog);
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO "Item" (id,name,tier,enchantment,"weightGrams","createdAt","updatedAt")
        SELECT id,name,tier,enchantment,"weightGrams",now(),now() FROM jsonb_to_recordset($1::jsonb)
        AS x(id text,name text,tier integer,enchantment integer,"weightGrams" integer) ON CONFLICT DO NOTHING`, [JSON.stringify(catalog.items)]);
      await tx.query(`INSERT INTO "CraftRecipe" (id,"outputItemId","outputQuantity","nutritionRequired","baseFocusCost","createdAt","updatedAt")
        SELECT id,"outputItemId","outputQuantity","nutritionRequired","baseFocusCost",now(),now() FROM jsonb_to_recordset($1::jsonb)
        AS x(id text,"outputItemId" text,"outputQuantity" integer,"nutritionRequired" integer,"baseFocusCost" integer) ON CONFLICT DO NOTHING`, [JSON.stringify(catalog.recipes)]);
      await tx.query(`INSERT INTO "CraftRecipeIngredient" (id,"recipeId","itemId",quantity,"receivesReturn","createdAt")
        SELECT id,"recipeId","itemId",quantity,"receivesReturn",now() FROM jsonb_to_recordset($1::jsonb)
        AS x(id text,"recipeId" text,"itemId" text,quantity integer,"receivesReturn" boolean) ON CONFLICT DO NOTHING`, [JSON.stringify(catalog.ingredients)]);
      await tx.query('INSERT INTO "PortableCatalog" (version,checksum) VALUES (1,$1)', [checksum(bytes)]);
    });
  }
  const count = (await db.query('SELECT count(*)::int AS count FROM "Item"')).rows[0].count;
  if (count < 1) throw new Error('Public catalog is empty; keep your database and restore the archive.');
  return count;
}
