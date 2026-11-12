import { z } from "zod";
import { after } from "next/server";

import type { AlbionServer } from "@/app/generated/prisma/enums";
import { toAlbionApiCity } from "@/lib/albion/city-mapping";
import {
  fetchCurrentPricesFast,
  type PublicMarketPrice,
} from "@/lib/albion/current-prices";
import { cachePublicMarketPrices, loadCachedPublicMarketPrices, mergeCurrentAndCachedPrices } from "@/lib/albion/market-price-cache";
import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { readJsonBody } from "@/lib/api/request";
import {
  calculateCraftingProfit,
  compareFocusCraftingProfit,
} from "@/lib/crafting/crafting";
import type { CraftingSelectedPrice } from "@/lib/crafting/types";
import { adjustedFocusCost } from "@/lib/crafting/focus";
import { getConsumableCategory } from "@/lib/crafting/consumable-catalog";
import { getRayenCraftingCategory } from "@/lib/crafting/rayen-catalog";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { loadSupplementalPriceSources } from "@/lib/market/price-sources";
import { fetchOnDemandHistoricalFallbacks, historicalFallbackKey } from "@/lib/albion/on-demand-history";
import { publicBuyPriceCandidate, publicSellPriceCandidate } from "@/lib/market/candidates";
import { getMarketFeeRates } from "@/lib/market/fees";
import { selectMarketPrice } from "@/lib/transport/price-selection";
import type { TransportWarning } from "@/lib/transport/types";

export const dynamic = "force-dynamic";

const citySchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().replaceAll(" ", "_").toUpperCase()
      : value,
  z.enum([
    "BRIDGEWATCH",
    "CAERLEON",
    "FORT_STERLING",
    "LYMHURST",
    "MARTLOCK",
    "THETFORD",
  ]),
);

const requestSchema = z.strictObject({
  recipeId: z.string().trim().min(1).max(128).default("recipe-t4-bag"),
  server: z.enum(["EUROPE", "AMERICAS", "ASIA"]).default("EUROPE"),
  materialCity: citySchema.default("BRIDGEWATCH"),
  craftCity: citySchema.default("LYMHURST"),
  sellCity: citySchema.default("CAERLEON"),
  materialBuyMethod: z.enum(["INSTANT_BUY", "BUY_ORDER"]).default("INSTANT_BUY"),
  saleMethod: z.enum(["FAST_SELL", "SELL_ORDER"]).default("FAST_SELL"),
  isPremium: z.boolean().default(true),
  outputQuality: z.coerce.number().int().min(1).max(5).default(1),
  runs: z.coerce.number().int().min(1).max(1_000_000).default(10),
  noFocusReturnRateBasisPoints: z.coerce.number().int().min(0).max(10_000).default(1870),
  focusReturnRateBasisPoints: z.coerce.number().int().min(0).max(10_000).default(4500),
  focusCost: z.coerce.number().int().min(1).max(1_000_000_000).nullable().optional(),
  focusCostEfficiency: z.coerce.number().int().min(0).max(100_000).default(0),
  useFocusComparison: z.coerce.boolean().default(true),
  stationFeePer100Nutrition: z.coerce.bigint().min(0n).max(1_000_000_000n).default(500n),
  taxRateBasisPoints: z.coerce.number().int().min(0).max(10_000).optional(),
  setupFeeSilver: z.coerce.bigint().min(0n).max(1_000_000_000_000n).default(0n),
  maxDataAgeMinutes: z.coerce.number().int().min(1).max(10_080).default(60),
});

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse({ error: body.error }, { status: body.status });
  const parsed = requestSchema.safeParse(body.value);

  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid crafting calculation request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const feeRates = getMarketFeeRates({
    isPremium: input.isPremium,
    saleMethod: input.saleMethod,
  });
  const now = new Date();
  const [recipe, currentUser] = await Promise.all([prisma.craftRecipe.findUnique({
    where: {
      id: input.recipeId,
    },
    include: {
      outputItem: true,
      ingredients: {
        include: {
          item: true,
        },
      },
    },
  }), getCurrentUser()]);

  if (!recipe) {
    return jsonResponse({ error: "Recipe not found." }, { status: 404 });
  }
  if (!getRayenCraftingCategory(recipe.outputItemId) && !getConsumableCategory(recipe.outputItemId)) {
    return jsonResponse({ error: "This recipe is not supported by the equipment or consumables calculators." }, { status: 400 });
  }

  const materialItemIds = recipe.ingredients.map((ingredient) => ingredient.itemId);
  const allItemIds = [...materialItemIds, recipe.outputItemId];
  const marketLocations = [
    toAlbionApiCity(input.materialCity),
    toAlbionApiCity(input.sellCity),
  ];
  const marketQualities = Array.from(new Set([1, input.outputQuality]));
  const currentPricesPromise = fetchCurrentPricesFast({
      server: input.server,
      itemIds: allItemIds,
      locations: marketLocations,
      qualities: marketQualities,
    }, { signal: request.signal });
  const cachedPricesPromise = loadCachedPublicMarketPrices({
    server: input.server as AlbionServer,
    itemIds: allItemIds,
    locations: marketLocations,
    qualities: marketQualities,
  });
  const supplementalPromise = loadSupplementalPriceSources({
    userId: currentUser?.id,
    server: input.server as AlbionServer,
    itemIds: allItemIds,
    cities: [input.materialCity, input.sellCity],
    qualities: marketQualities,
    now,
  });
  const [currentPrices, cachedPrices, supplemental] = await Promise.all([
    currentPricesPromise,
    cachedPricesPromise,
    supplementalPromise,
  ]);

  after(async () => {
    try {
      await cachePublicMarketPrices(currentPrices, input.server as AlbionServer);
    } catch (error) {
      console.error("Could not persist crafting market prices.", error);
    }
  });
  const prices = mergeCurrentAndCachedPrices(currentPrices, cachedPrices);
  const materialOrderType = input.materialBuyMethod === "BUY_ORDER" ? "BUY" as const : "SELL" as const;
  const outputOrderType = input.saleMethod === "SELL_ORDER" ? "SELL" as const : "BUY" as const;
  const materialLocation = toAlbionApiCity(input.materialCity);
  const sellLocation = toAlbionApiCity(input.sellCity);
  const missingMaterialIds = recipe.ingredients.flatMap((ingredient) => {
    if (materialOrderType === "BUY") return [];
    const row = findPrice(prices, ingredient.itemId, materialLocation, 1);
    const candidate = publicSellPriceCandidate(row);
    const hasPrivate = supplemental.privateCandidates(ingredient.itemId, input.materialCity, 1, materialOrderType).length > 0;
    const hasStoredHistory = supplemental.historicalCandidate(ingredient.itemId, input.materialCity, 1, materialOrderType) !== null;
    return (candidate?.price ?? null) === null && !hasPrivate && !hasStoredHistory ? [ingredient.itemId] : [];
  });
  const outputRow = findPrice(prices, recipe.outputItemId, sellLocation, input.outputQuality);
  const outputCandidate = outputOrderType === "BUY" ? publicBuyPriceCandidate(outputRow) : publicSellPriceCandidate(outputRow);
  const outputNeedsHistory = (outputCandidate?.price ?? null) === null
    && supplemental.privateCandidates(recipe.outputItemId, input.sellCity, input.outputQuality, outputOrderType).length === 0
    && supplemental.historicalCandidate(recipe.outputItemId, input.sellCity, input.outputQuality, outputOrderType) === null;
  let onDemandHistory = new Map<string, import("@/lib/transport/types").MarketPriceCandidate>();
  try {
    onDemandHistory = await fetchOnDemandHistoricalFallbacks({
      server: input.server as AlbionServer,
      requests: [
        { itemIds: missingMaterialIds, location: materialLocation, quality: 1, strategy: "ORIGIN_COST" },
        { itemIds: outputNeedsHistory ? [recipe.outputItemId] : [], location: sellLocation, quality: input.outputQuality, strategy: "DESTINATION_REVENUE" },
      ],
      signal: request.signal,
    });
  } catch {
    // History is optional; calculations still return explicit missing prices.
  }

  const ingredients = recipe.ingredients.map((ingredient) => {
    const publicPrice = findPrice(
      prices,
      ingredient.itemId,
      toAlbionApiCity(input.materialCity),
      1,
    );
    const selected = selectMarketPrice({
      publicPrice: input.materialBuyMethod === "BUY_ORDER"
        ? publicBuyPriceCandidate(publicPrice)
        : publicSellPriceCandidate(publicPrice),
      privatePrices: supplemental.privateCandidates(ingredient.itemId, input.materialCity, 1, input.materialBuyMethod === "BUY_ORDER" ? "BUY" : "SELL"),
      historicalPrice: supplemental.historicalCandidate(ingredient.itemId, input.materialCity, 1, materialOrderType)
        ?? onDemandHistory.get(historicalFallbackKey(ingredient.itemId, materialLocation, 1)),
      now,
      maxDataAgeMinutes: input.maxDataAgeMinutes,
    });

    return {
      itemId: ingredient.itemId,
      quantityPerRun: ingredient.quantity,
      unitPrice: toCraftingPrice(
        selected,
        "material",
        input.materialBuyMethod === "BUY_ORDER"
          ? ["Material price depends on buy order"]
          : [],
      ),
      weightGrams: ingredient.item.weightGrams,
      receivesReturn: ingredient.receivesReturn,
    };
  });

  const outputPublicPrice = findPrice(
    prices,
    recipe.outputItemId,
    toAlbionApiCity(input.sellCity),
    input.outputQuality,
  );
  const outputUnitPrice = toCraftingPrice(
    selectMarketPrice({
      publicPrice: input.saleMethod === "SELL_ORDER"
        ? publicSellPriceCandidate(outputPublicPrice)
        : publicBuyPriceCandidate(outputPublicPrice),
      privatePrices: supplemental.privateCandidates(recipe.outputItemId, input.sellCity, input.outputQuality, input.saleMethod === "SELL_ORDER" ? "SELL" : "BUY"),
      historicalPrice: supplemental.historicalCandidate(recipe.outputItemId, input.sellCity, input.outputQuality, outputOrderType)
        ?? onDemandHistory.get(historicalFallbackKey(recipe.outputItemId, sellLocation, input.outputQuality)),
      now,
      maxDataAgeMinutes: input.maxDataAgeMinutes,
    }),
    "output",
    input.saleMethod === "SELL_ORDER"
      ? ["Output price depends on sell order"]
      : [],
  );

  const commonInput = {
    outputItemId: recipe.outputItemId,
    outputQuality: input.outputQuality,
    outputQuantityPerRun: recipe.outputQuantity,
    runs: input.runs,
    outputUnitPrice,
    outputWeightGrams: recipe.outputItem.weightGrams,
    ingredients,
    stationFeePer100Nutrition: input.stationFeePer100Nutrition,
    nutritionPerRun: recipe.nutritionRequired ?? 0,
    taxRateBasisPoints: input.taxRateBasisPoints ?? feeRates.salesTaxBasisPoints,
    setupFeeSilver: input.setupFeeSilver,
    setupFeeRateBasisPoints: feeRates.setupFeeBasisPoints,
    now,
    maxDataAgeMinutes: input.maxDataAgeMinutes,
  };

  const result = input.useFocusComparison
    ? compareFocusCraftingProfit({
        ...commonInput,
        noFocusReturnRateBasisPoints: input.noFocusReturnRateBasisPoints,
        focusReturnRateBasisPoints: input.focusReturnRateBasisPoints,
        focusCost: input.focusCost ?? adjustedFocusCost(
          recipe.baseFocusCost,
          input.runs,
          input.focusCostEfficiency,
        ),
      })
    : calculateCraftingProfit({
        ...commonInput,
        resourceReturnRateBasisPoints: input.noFocusReturnRateBasisPoints,
        focusCost: input.focusCost ?? adjustedFocusCost(
          recipe.baseFocusCost,
          input.runs,
          input.focusCostEfficiency,
        ),
      });

  const itemNames = new Map([
    [recipe.outputItem.id, recipe.outputItem.name ?? recipe.outputItem.id],
    ...recipe.ingredients.map((ingredient) => [
      ingredient.item.id,
      ingredient.item.name ?? ingredient.item.id,
    ] as const),
  ]);
  const namedResult = "withoutFocus" in result
    ? {
        ...result,
        withoutFocus: addNames(result.withoutFocus, itemNames),
        withFocus: addNames(result.withFocus, itemNames),
      }
    : addNames(result, itemNames);

  return jsonResponse(serializeForJson({
    recipeId: recipe.id,
    outputItemName: itemNames.get(recipe.outputItemId),
    materialBuyMethod: input.materialBuyMethod,
    saleMethod: input.saleMethod,
    isPremium: input.isPremium,
    result: namedResult,
  }));
}

function addNames<T extends { ingredients: Array<{ itemId: string }> }>(
  result: T,
  names: ReadonlyMap<string, string>,
) {
  return {
    ...result,
    ingredients: result.ingredients.map((ingredient) => ({
      ...ingredient,
      itemName: names.get(ingredient.itemId) ?? ingredient.itemId,
    })),
  };
}

function findPrice(
  prices: PublicMarketPrice[],
  itemId: string,
  city: string,
  quality: number,
): PublicMarketPrice | null {
  return (
    prices.find(
      (price) =>
        price.itemId === itemId &&
        price.city === city &&
        price.quality === quality,
    ) ?? null
  );
}

function toCraftingPrice(
  price: ReturnType<typeof selectMarketPrice>,
  side: "material" | "output",
  extraWarnings: CraftingSelectedPrice["warnings"] = [],
): CraftingSelectedPrice {
  return {
    price: price.price,
    source: price.source,
    observedAt: price.observedAt,
    availableQuantity: price.availableQuantity,
    warnings: [...price.warnings.map((warning) => toCraftingWarning(warning, side)), ...extraWarnings],
  };
}

function toCraftingWarning(warning: TransportWarning, side: "material" | "output") {
  if (warning === "Source price is stale" || warning === "Destination price is stale") {
    return side === "material" ? "Material price is stale" : "Output price is stale";
  }

  if (warning === "Source price missing" || warning === "Destination price missing") {
    return side === "material" ? "Material price missing" : "Output price missing";
  }

  if (warning === "Quantity unknown") {
    return "Material quantity unknown";
  }

  if (warning === "Private price overrides public price") return warning;
  if (warning === "Last known public price fallback") return warning;
  if (warning === "Historical average price estimate" || warning === "Destination is a historical trade estimate, not a live buy order") return "Historical price estimate";
  if (warning === "Calculated price estimate") return warning;

  return side === "material" ? "Material price missing" : "Output price missing";
}
