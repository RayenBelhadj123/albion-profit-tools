import { z } from "zod";

import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { prisma } from "@/lib/db/prisma";
import { getRayenCraftingCategory, RAYEN_CRAFTING_CATEGORIES } from "@/lib/crafting/rayen-catalog";

export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  q: z.string().max(100).optional().default(""),
  category: z.enum(RAYEN_CRAFTING_CATEGORIES).optional(),
  limit: z.coerce.number().int().positive().max(2_500).default(2_500),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid recipe query." }, { status: 400 });
  }

  const query = parsed.data.q.trim();
  const recipes = await prisma.craftRecipe.findMany({
    where: {
      NOT: { outputItemId: { startsWith: "QUESTITEM_" } },
      // The RAYEN equipment sheet covers the normal craftable T4-T8 range.
      outputItem: { tier: { gte: 4, lte: 8 } },
      AND: [{
        OR: [
          { outputItemId: { contains: "_SHOES_LEATHER_" } },
          { outputItemId: { contains: "_SHOES_CLOTH_" } },
          { outputItemId: { contains: "ARCANE" } },
          { outputItemId: { contains: "_2H_BOW" } },
          { outputItemId: { contains: "_2H_WARBOW" } },
          { outputItemId: { contains: "_2H_LONGBOW" } },
          { outputItemId: { contains: "_ARMOR_CLOTH_" } },
          { outputItemId: { contains: "_ARMOR_PLATE_" } },
          { outputItemId: { contains: "_HEAD_LEATHER_" } },
          { outputItemId: { contains: "_HEAD_PLATE_" } },
          { outputItemId: { contains: "CAPE" } },
        ],
      }],
      OR: query
        ? [
            { outputItemId: { contains: query, mode: "insensitive" } },
            { outputItem: { name: { contains: query, mode: "insensitive" } } },
          ]
        : undefined,
    },
    include: {
      outputItem: true,
      _count: { select: { ingredients: true } },
    },
    orderBy: [{ outputItem: { tier: "asc" } }, { outputItemId: "asc" }],
    take: parsed.data.limit,
  });

  return jsonResponse(
    serializeForJson({
      recipes: recipes
        .map((recipe) => {
          const category = getRayenCraftingCategory(recipe.outputItemId);
          return {
          id: recipe.id,
          outputItemId: recipe.outputItemId,
          name: recipe.outputItem.name ?? recipe.outputItemId,
          tier: recipe.outputItem.tier,
          enchantment: recipe.outputItem.enchantment,
          category,
          ingredientCount: recipe._count.ingredients,
          };
        })
        .filter(
          (recipe): recipe is typeof recipe & { category: NonNullable<typeof recipe.category> } =>
            recipe.category !== null &&
            (!parsed.data.category || recipe.category === parsed.data.category),
        ),
      categories: RAYEN_CRAFTING_CATEGORIES,
    }),
  );
}
