import { z } from "zod";

import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { prisma } from "@/lib/db/prisma";
import { getItemCategory, ITEM_CATEGORIES } from "@/lib/items/category";

export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  q: z.string().max(100).optional().default(""),
  tier: z.coerce.number().int().min(1).max(8).optional(),
  enchantment: z.coerce.number().int().min(0).max(4).optional(),
  limit: z.coerce.number().int().positive().max(5_000).default(25),
  summary: z.stringbool().default(false),
});

export async function GET(request: Request) {
  const searchParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(searchParams);

  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid item search query.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const query = parsed.data.q.trim();
  if (parsed.data.summary) {
    const count = await prisma.item.count();
    return jsonResponse({ count, categories: ITEM_CATEGORIES });
  }
  const items = await prisma.item.findMany({
    where: {
      tier: parsed.data.tier,
      enchantment: parsed.data.enchantment,
      NOT: [
        { id: { contains: "NONTRADABLE" } },
        { id: { startsWith: "QUESTITEM_" } },
      ],
      OR: query
        ? [
            {
              id: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
          ]
        : undefined,
    },
    orderBy: [{ tier: "asc" }, { id: "asc" }],
    take: parsed.data.limit,
  });

  return jsonResponse(
    serializeForJson({
      items: items.map((item) => ({
        ...item,
        category: getItemCategory(item.id),
      })),
      categories: ITEM_CATEGORIES,
    }),
  );
}
