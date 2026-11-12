import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../app/generated/prisma/client";
import { resolveDirectDatabaseUrl } from "../lib/db/database-url";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDirectDatabaseUrl(databaseUrl) }),
});

void Promise.all([
  prisma.item.count(),
  prisma.route.count(),
  prisma.craftRecipe.count(),
  prisma.marketPriceCache.count(),
  prisma.marketPriceObservation.count({ where: { userId: null } }),
  prisma.blackMarketScanSnapshot.count(),
]).then(
  async ([items, routes, recipes, prices, observations, snapshots]) => {
    console.log(JSON.stringify({ items, routes, recipes, prices, observations, snapshots }));
    await prisma.$disconnect();
    process.exit(0);
  },
  async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  },
);
