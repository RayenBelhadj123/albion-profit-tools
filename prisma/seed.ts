import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../app/generated/prisma/client";
import { resolveDirectDatabaseUrl } from "../lib/db/database-url";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: resolveDirectDatabaseUrl(databaseUrl),
  }),
});

const DEFAULT_USER_ID = "local-user";

async function main() {
  await prisma.user.upsert({
    where: {
      id: DEFAULT_USER_ID,
    },
    create: {
      id: DEFAULT_USER_ID,
      email: "local@albion-transport.test",
      displayName: "Local Player",
    },
    update: {},
  });

  await prisma.userSetting.upsert({
    where: {
      userId: DEFAULT_USER_ID,
    },
    create: {
      userId: DEFAULT_USER_ID,
      defaultServer: "EUROPE",
      defaultSourceCity: "BRIDGEWATCH",
      defaultDestinationCity: "CAERLEON",
      defaultCapitalSilver: 2_000_000n,
      defaultCapacityGrams: 120_000,
      defaultTaxRateBasisPoints: 650,
      maxDataAgeMinutes: 60,
    },
    update: {},
  });

  await prisma.transportProfile.upsert({
    where: {
      id: "default-transport-profile",
    },
    create: {
      id: "default-transport-profile",
      userId: DEFAULT_USER_ID,
      name: "Default Transport",
      defaultServer: "EUROPE",
      availableSilver: 2_000_000n,
      carryingCapacityGrams: 120_000,
      taxRateBasisPoints: 650,
      maxDataAgeMinutes: 60,
    },
    update: {},
  });

  await prisma.craftProfile.upsert({
    where: {
      id: "default-craft-profile",
    },
    create: {
      id: "default-craft-profile",
      userId: DEFAULT_USER_ID,
      name: "Default Crafting",
      defaultServer: "EUROPE",
      materialCity: "BRIDGEWATCH",
      craftCity: "LYMHURST",
      sellCity: "CAERLEON",
      resourceReturnRateBasisPoints: 1870,
      focusReturnRateBasisPoints: 4500,
      taxRateBasisPoints: 650,
      stationFeePer100Nutrition: 500n,
      maxDataAgeMinutes: 60,
    },
    update: {},
  });

  const items = [
    { id: "T4_BAG", name: "Adept's Bag", tier: 4, weightGrams: 750 },
    { id: "T5_BAG", name: "Expert's Bag", tier: 5, weightGrams: 1125 },
    { id: "T3_LEATHER", name: "Stiff Leather", tier: 3, weightGrams: 50 },
    { id: "T4_LEATHER", name: "Worked Leather", tier: 4, weightGrams: 100 },
    { id: "T4_CLOTH", name: "Fine Cloth", tier: 4, weightGrams: 50 },
    { id: "T5_LEATHER", name: "Cured Leather", tier: 5, weightGrams: 150 },
    { id: "T5_CLOTH", name: "Ornate Cloth", tier: 5, weightGrams: 75 },
    { id: "T4_HIDE", name: "Medium Hide", tier: 4, weightGrams: 70 },
    { id: "T5_HIDE", name: "Heavy Hide", tier: 5, weightGrams: 105 },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: {
        id: item.id,
      },
      create: item,
      update: item,
    });
  }

  await prisma.craftRecipe.upsert({
    where: {
      id: "recipe-t4-bag",
    },
    create: {
      id: "recipe-t4-bag",
      outputItemId: "T4_BAG",
      outputQuantity: 1,
      nutritionRequired: 12,
      baseFocusCost: 300,
      ingredients: {
        create: [
          {
            itemId: "T4_LEATHER",
            quantity: 16,
          },
          {
            itemId: "T4_CLOTH",
            quantity: 8,
          },
        ],
      },
    },
    update: {
      outputItemId: "T4_BAG",
      outputQuantity: 1,
      nutritionRequired: 12,
      baseFocusCost: 300,
    },
  });

  const routes = [
    ["BRIDGEWATCH", "CAERLEON", 18],
    ["BRIDGEWATCH", "LYMHURST", 12],
    ["LYMHURST", "CAERLEON", 16],
    ["MARTLOCK", "CAERLEON", 15],
    ["THETFORD", "CAERLEON", 17],
    ["FORT_STERLING", "CAERLEON", 20],
  ] as const;

  for (const [sourceCity, destinationCity, durationMinutes] of routes) {
    await prisma.route.upsert({
      where: {
        server_sourceCity_destinationCity: {
          server: "EUROPE",
          sourceCity,
          destinationCity,
        },
      },
      create: {
        server: "EUROPE",
        sourceCity,
        destinationCity,
        durationMinutes,
      },
      update: {
        durationMinutes,
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
