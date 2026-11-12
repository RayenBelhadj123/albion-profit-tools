import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../app/generated/prisma/client";
import { resolveDirectDatabaseUrl } from "../lib/db/database-url";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const destinationUrl = process.env.DATABASE_URL;

if (!sourceUrl || !destinationUrl) {
  throw new Error("SOURCE_DATABASE_URL and DATABASE_URL are required.");
}

const source = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDirectDatabaseUrl(sourceUrl) }),
});
const destination = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDirectDatabaseUrl(destinationUrl) }),
});

async function copyInPages<T>(
  label: string,
  load: (skip: number, take: number) => Promise<T[]>,
  write: (rows: T[]) => Promise<unknown>,
) {
  const pageSize = 2_000;
  let copied = 0;
  while (true) {
    const rows = await load(copied, pageSize);
    if (rows.length === 0) break;
    await write(rows);
    copied += rows.length;
  }
  console.log(`${label}: ${copied}`);
}

async function main() {
try {
  await copyInPages("items", (skip, take) => source.item.findMany({ skip, take, orderBy: { id: "asc" } }),
    (rows) => destination.item.createMany({ data: rows, skipDuplicates: true }));
  await copyInPages("routes", (skip, take) => source.route.findMany({ skip, take, orderBy: { id: "asc" } }),
    (rows) => destination.route.createMany({ data: rows, skipDuplicates: true }));
  await copyInPages("craft recipes", (skip, take) => source.craftRecipe.findMany({ skip, take, orderBy: { id: "asc" } }),
    (rows) => destination.craftRecipe.createMany({ data: rows, skipDuplicates: true }));
  await copyInPages("recipe ingredients", (skip, take) => source.craftRecipeIngredient.findMany({ skip, take, orderBy: { id: "asc" } }),
    (rows) => destination.craftRecipeIngredient.createMany({ data: rows, skipDuplicates: true }));
  await copyInPages("market price cache", (skip, take) => source.marketPriceCache.findMany({ skip, take, orderBy: { id: "asc" } }),
    (rows) => destination.marketPriceCache.createMany({ data: rows, skipDuplicates: true }));
  await copyInPages("public market observations", (skip, take) => source.marketPriceObservation.findMany({
    skip,
    take,
    where: { userId: null },
    orderBy: { id: "asc" },
  }), (rows) => destination.marketPriceObservation.createMany({
    data: rows.map((row) => ({
      ...row,
      metadataJson: row.metadataJson === null ? Prisma.DbNull : row.metadataJson as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  }));
  await copyInPages("coverage snapshots", (skip, take) => source.blackMarketScanSnapshot.findMany({ skip, take, orderBy: { id: "asc" } }),
    (rows) => destination.blackMarketScanSnapshot.createMany({
      data: rows.map((row) => ({ ...row, result: row.result as Prisma.InputJsonValue })),
      skipDuplicates: true,
    }));
} finally {
  await Promise.all([source.$disconnect(), destination.$disconnect()]);
}
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
