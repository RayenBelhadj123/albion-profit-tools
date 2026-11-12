import { z } from "zod";
import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { prisma } from "@/lib/db/prisma";
import { buildCoverageQueue } from "@/lib/market/coverage";

export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  server: z.enum(["EUROPE", "AMERICAS", "ASIA"]).default("EUROPE"),
  quality: z.coerce.number().int().min(1).max(5).default(1),
  maxAgeMinutes: z.coerce.number().int().min(1).max(10_080).default(1_440),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonResponse({ error: "Invalid coverage request.", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  // Keep these reads sequential. The local/cloud Prisma proxy can otherwise
  // hold several large result portals at once and delay the whole response.
  const items = await prisma.item.findMany({
      where: {
        tier: { gte: 2, lte: 8 },
        name: { not: null },
        NOT: [{ id: { contains: "NONTRADABLE" } }, { id: { startsWith: "QUESTITEM_" } }],
      },
      select: { id: true, name: true, tier: true },
    });
  const prices = await prisma.marketPriceCache.findMany({
      where: { server: input.server, quality: input.quality },
      select: { itemId: true, city: true, sellPriceMin: true, sellPriceMinDate: true, buyPriceMax: true, buyPriceMaxDate: true },
    });
  const recipes = await prisma.craftRecipe.findMany({
      select: { outputItemId: true, ingredients: { select: { itemId: true } } },
    });
  const result = buildCoverageQueue({
    items,
    prices,
    recipeOutputs: new Set(recipes.map((recipe) => recipe.outputItemId)),
    recipeIngredients: new Set(recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.itemId))),
    now: new Date(),
    maxAgeMinutes: input.maxAgeMinutes,
    limit: input.limit,
  });
  return jsonResponse(serializeForJson({ ...result, server: input.server, quality: input.quality, maxAgeMinutes: input.maxAgeMinutes, generatedAt: new Date() }));
}
