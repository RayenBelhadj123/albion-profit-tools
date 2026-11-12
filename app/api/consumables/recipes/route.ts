import { z } from "zod";
import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { CONSUMABLE_CATEGORIES, getConsumableCategory, getConsumableFamily } from "@/lib/crafting/consumable-catalog";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  q: z.string().trim().max(100).default(""),
  category: z.enum(CONSUMABLE_CATEGORIES).optional(),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonResponse({ error: "Invalid consumable recipe query." }, { status: 400 });
  const recipes = await prisma.craftRecipe.findMany({
    where: {
      outputItem: { tier: { gte: 2 } },
      AND: [
        { OR: [{ outputItemId: { contains: "_MEAL_" } }, { outputItemId: { contains: "_FOOD_" } }, { outputItemId: { contains: "_POTION_" } }] },
        ...(parsed.data.q ? [{ OR: [
          { outputItemId: { contains: parsed.data.q, mode: "insensitive" as const } },
          { outputItem: { name: { contains: parsed.data.q, mode: "insensitive" as const } } },
        ] }] : []),
      ],
    },
    include: { outputItem: true, _count: { select: { ingredients: true } } },
    orderBy: [{ outputItem: { tier: "asc" } }, { outputItemId: "asc" }],
    take: 1000,
  });
  const result = recipes.flatMap((recipe) => {
    const category = getConsumableCategory(recipe.outputItemId);
    if (!category || (parsed.data.category && category !== parsed.data.category)) return [];
    return [{
      id: recipe.id,
      outputItemId: recipe.outputItemId,
      name: recipe.outputItem.name ?? recipe.outputItemId,
      tier: recipe.outputItem.tier,
      enchantment: recipe.outputItem.enchantment,
      category,
      family: getConsumableFamily(recipe.outputItemId) ?? category,
      outputQuantity: recipe.outputQuantity,
      ingredientCount: recipe._count.ingredients,
    }];
  });
  return jsonResponse(serializeForJson({ recipes: result, categories: CONSUMABLE_CATEGORIES }));
}
