export type RefiningRecipeDefinition = {
  id: string;
  label: string;
  resourceType: RefiningResourceType;
  tier: number;
  enchantment: number;
  bonusCity: string;
  outputItemId: string;
  outputQuantity: number;
  nutritionRequired: number;
  baseFocusCost: number;
  ingredients: Array<{
    itemId: string;
    quantity: number;
    receivesReturn?: boolean;
    isPrimaryMaterial?: boolean;
  }>;
};

export type RefiningResourceType = "LEATHER" | "PLANKS" | "METALBAR" | "CLOTH" | "STONEBLOCK";

const resourceLines = [
  { type: "LEATHER", label: "Leather", raw: "HIDE", city: "MARTLOCK" },
  { type: "PLANKS", label: "Planks", raw: "WOOD", city: "FORT_STERLING" },
  { type: "METALBAR", label: "Metal Bar", raw: "ORE", city: "THETFORD" },
  { type: "CLOTH", label: "Cloth", raw: "FIBER", city: "LYMHURST" },
  { type: "STONEBLOCK", label: "Stone Block", raw: "ROCK", city: "BRIDGEWATCH" },
] as const;

const tiers = [
  { tier: 4, rawQuantity: 2, nutrition: 1, focus: 12, prefix: "Adept's" },
  { tier: 5, rawQuantity: 3, nutrition: 2, focus: 22, prefix: "Expert's" },
  { tier: 6, rawQuantity: 4, nutrition: 4, focus: 44, prefix: "Master's" },
  { tier: 7, rawQuantity: 5, nutrition: 8, focus: 89, prefix: "Grandmaster's" },
  { tier: 8, rawQuantity: 5, nutrition: 16, focus: 178, prefix: "Elder's" },
] as const;

const enchantments = [0, 1, 2, 3, 4] as const;

function enchantedId(tier: number, type: string, enchantment: number) {
  return enchantment === 0
    ? `T${tier}_${type}`
    : `T${tier}_${type}_LEVEL${enchantment}@${enchantment}`;
}

export const refiningRecipes: RefiningRecipeDefinition[] = resourceLines.flatMap((line) =>
  tiers.flatMap((tier) => enchantments.map((enchantment) => ({
    id: `refine-t${tier.tier}-${line.type.toLowerCase()}-${enchantment}`,
    label: `${tier.prefix} ${line.label}${enchantment ? ` .${enchantment}` : ""}`,
    resourceType: line.type,
    tier: tier.tier,
    enchantment,
    bonusCity: line.city,
    outputItemId: enchantedId(tier.tier, line.type, enchantment),
    outputQuantity: 1,
    nutritionRequired: tier.nutrition,
    baseFocusCost: tier.focus,
    ingredients: [
      {
        itemId: enchantedId(tier.tier, line.raw, enchantment),
        quantity: tier.rawQuantity,
        isPrimaryMaterial: true,
      },
      {
        itemId: enchantedId(tier.tier - 1, line.type, tier.tier === 4 ? 0 : enchantment),
        quantity: 1,
      },
    ],
  }))),
);

export function findRefiningRecipe(recipeId: string): RefiningRecipeDefinition | null {
  const legacyId = recipeId === "refine-t4-leather" ? "refine-t4-leather-0"
    : recipeId === "refine-t5-leather" ? "refine-t5-leather-0"
      : recipeId;
  return refiningRecipes.find((recipe) => recipe.id === legacyId) ?? null;
}
