export const CONSUMABLE_CATEGORIES = ["Food", "Potions"] as const;
export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

const FAMILY_LABELS: Record<string, string> = {
  STEW: "Stews",
  SANDWICH: "Sandwiches",
  OMELETTE: "Omelettes",
  PIE: "Pies",
  SALAD: "Salads",
  SOUP: "Soups",
  ROAST: "Roasts",
  HEAL: "Healing potions",
  ENERGY: "Energy potions",
  STONESKIN: "Resistance potions",
  RESISTANCE: "Resistance potions",
  POISON: "Poison potions",
  INVISIBILITY: "Invisibility potions",
  GIGANTIFY: "Gigantify potions",
  CLEANSE: "Cleansing potions",
  ACID: "Acid potions",
};

export function getConsumableCategory(itemId: string): ConsumableCategory | null {
  const id = itemId.toUpperCase().replace(/@\d+$/, "");
  if (/(^|_)POTION(_|$)/.test(id)) return "Potions";
  if (/(^|_)(MEAL|FOOD)(_|$)/.test(id)) return "Food";
  return null;
}

export function getConsumableFamily(itemId: string): string | null {
  const id = itemId.trim().toUpperCase().replace(/@\d+$/, "").replace(/^T\d+_/, "");
  const category = getConsumableCategory(id);
  if (!category) return null;

  const prefix = category === "Food" ? /^(?:MEAL|FOOD)_/ : /^POTION_/;
  const familyKey = id.replace(prefix, "").split("_")[0];
  return FAMILY_LABELS[familyKey] ?? toTitleCase(familyKey || category);
}

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/(^|\s)\w/g, (character) => character.toUpperCase());
}
