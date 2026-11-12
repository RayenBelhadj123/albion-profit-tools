import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import { PrismaClient } from "../app/generated/prisma/client";
import { resolveDirectDatabaseUrl } from "../lib/db/database-url";
import {
  buildEnglishItemNameMap,
  localizedItemCatalogSchema,
  resolveEnglishItemName,
} from "../lib/items/localized-names";

const ITEM_DUMP_URL =
  "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json";
const LOCALIZED_ITEM_DUMP_URL =
  "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json";

const dumpSchema = z.object({
  items: z.record(z.string(), z.unknown()),
});

const rawItemSchema = z.looseObject({
  "@uniquename": z.string(),
  "@tier": z.coerce.number().int().min(1).max(8).optional(),
  "@weight": z.coerce.number().positive().optional(),
  "@shopcategory": z.string().optional(),
  "@showinmarketplace": z.union([z.literal("true"), z.literal(true)]).optional(),
  craftingrequirements: z.unknown().optional(),
  enchantments: z.unknown().optional(),
});

const craftResourceSchema = z.looseObject({
  "@uniquename": z.string(),
  "@count": z.coerce.number().int().positive(),
});

const craftingRequirementsSchema = z.looseObject({
  "@craftingfocus": z.coerce.number().int().positive().optional(),
  craftresource: z.union([craftResourceSchema, z.array(craftResourceSchema)]),
});

type CatalogItem = {
  id: string;
  name: string;
  tier: number | null;
  enchantment: number;
  weightGrams: number | null;
};

type CatalogRecipe = {
  id: string;
  outputItemId: string;
  baseFocusCost: number | null;
  ingredients: Array<{ itemId: string; quantity: number }>;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const [itemResponse, localizedItemResponse] = await Promise.all([
    fetch(ITEM_DUMP_URL, { headers: { accept: "application/json" } }),
    fetch(LOCALIZED_ITEM_DUMP_URL, { headers: { accept: "application/json" } }),
  ]);
  if (!itemResponse.ok) {
    throw new Error(`Albion item dump request failed with ${itemResponse.status}.`);
  }
  if (!localizedItemResponse.ok) {
    throw new Error(
      `Albion localized item dump request failed with ${localizedItemResponse.status}.`,
    );
  }

  const [dump, localizedItems] = await Promise.all([
    itemResponse.json().then((value) => dumpSchema.parse(value)),
    localizedItemResponse
      .json()
      .then((value) => localizedItemCatalogSchema.parse(value)),
  ]);
  const englishNames = buildEnglishItemNameMap(localizedItems);
  const catalog = extractCatalog(dump.items, englishNames);
  const recipes = extractRecipes(dump.items, new Set(catalog.map((item) => item.id)));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: resolveDirectDatabaseUrl(databaseUrl),
    }),
  });

  try {
    let imported = 0;
    for (let index = 0; index < catalog.length; index += 1_000) {
      const batch = catalog.slice(index, index + 1_000);
      const result = await prisma.item.createMany({
        data: batch,
        skipDuplicates: true,
      });
      imported += result.count;
    }
    const updatedNames = await updateExistingItemNames(prisma, catalog);
    let createdRecipeCount = 0;
    for (let index = 0; index < recipes.length; index += 500) {
      const result = await prisma.craftRecipe.createMany({
        data: recipes.slice(index, index + 500).map((recipe) => ({
          id: recipe.id,
          outputItemId: recipe.outputItemId,
          outputQuantity: 1,
          baseFocusCost: recipe.baseFocusCost,
        })),
        skipDuplicates: true,
      });
      createdRecipeCount += result.count;
    }
    const ingredients = recipes.flatMap((recipe) =>
      recipe.ingredients.map((ingredient) => ({
        recipeId: recipe.id,
        itemId: ingredient.itemId,
        quantity: ingredient.quantity,
      })),
    );
    let createdIngredientCount = 0;
    for (let index = 0; index < ingredients.length; index += 1_000) {
      const result = await prisma.craftRecipeIngredient.createMany({
        data: ingredients.slice(index, index + 1_000),
        skipDuplicates: true,
      });
      createdIngredientCount += result.count;
    }
    console.log(
      `Catalog contains ${catalog.length} marketplace items; imported ${imported} items, updated ${updatedNames} existing names, ${createdRecipeCount} recipes, and ${createdIngredientCount} ingredients.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function extractRecipes(
  groups: Record<string, unknown>,
  catalogIds: Set<string>,
): CatalogRecipe[] {
  const recipes: CatalogRecipe[] = [];
  for (const value of Object.values(groups)) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      const itemResult = rawItemSchema.safeParse(candidate);
      if (!itemResult.success || !catalogIds.has(itemResult.data["@uniquename"])) continue;
      const requirements = craftingRequirementsSchema.safeParse(
        itemResult.data.craftingrequirements,
      );
      if (!requirements.success) continue;
      const resources = Array.isArray(requirements.data.craftresource)
        ? requirements.data.craftresource
        : [requirements.data.craftresource];
      const ingredients = resources
        .filter((resource) => catalogIds.has(resource["@uniquename"]))
        .map((resource) => ({
          itemId: resource["@uniquename"],
          quantity: resource["@count"],
        }));
      if (ingredients.length !== resources.length || ingredients.length === 0) continue;
      const outputItemId = itemResult.data["@uniquename"];
      recipes.push({
        id: outputItemId === "T4_BAG" ? "recipe-t4-bag" : `dump-${outputItemId}`,
        outputItemId,
        baseFocusCost: requirements.data["@craftingfocus"] ?? null,
        ingredients,
      });
    }
  }
  return recipes;
}

function extractCatalog(
  groups: Record<string, unknown>,
  englishNames: ReadonlyMap<string, string>,
): CatalogItem[] {
  const byId = new Map<string, CatalogItem>();

  for (const value of Object.values(groups)) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      const parsed = rawItemSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const item = parsed.data;
      if (!item["@showinmarketplace"] && !item["@shopcategory"]) continue;

      const weightGrams = item["@weight"]
        ? Math.round(item["@weight"] * 1_000)
        : null;
      const tier = item["@tier"] ?? tierFromId(item["@uniquename"]);
      const base: CatalogItem = {
        id: item["@uniquename"],
        name: resolveEnglishItemName(item["@uniquename"], englishNames),
        tier,
        enchantment: 0,
        weightGrams,
      };
      byId.set(base.id, base);

      if (item.enchantments) {
        for (let enchantment = 1; enchantment <= 4; enchantment += 1) {
          const enchanted = {
            ...base,
            id: `${base.id}@${enchantment}`,
            name: resolveEnglishItemName(
              `${base.id}@${enchantment}`,
              englishNames,
            ),
            enchantment,
          };
          byId.set(enchanted.id, enchanted);
        }
      }
    }
  }

  return Array.from(byId.values());
}

async function updateExistingItemNames(
  prisma: PrismaClient,
  catalog: readonly CatalogItem[],
): Promise<number> {
  let updated = 0;

  for (let index = 0; index < catalog.length; index += 1_000) {
    const batch = catalog.slice(index, index + 1_000);
    const values = batch
      .map((_, valueIndex) => {
        const parameter = valueIndex * 2;
        return `($${parameter + 1}::text, $${parameter + 2}::text)`;
      })
      .join(", ");
    const parameters = batch.flatMap((item) => [item.id, item.name]);

    updated += await prisma.$executeRawUnsafe(
      `UPDATE "Item" AS item
       SET "name" = names.name, "updatedAt" = CURRENT_TIMESTAMP
       FROM (VALUES ${values}) AS names(id, name)
       WHERE item.id = names.id
         AND item."name" IS DISTINCT FROM names.name`,
      ...parameters,
    );
  }

  return updated;
}

function tierFromId(itemId: string): number | null {
  const match = /^T([1-8])_/.exec(itemId);
  return match ? Number(match[1]) : null;
}

void main();
