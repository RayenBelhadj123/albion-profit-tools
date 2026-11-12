export const RAYEN_CRAFTING_CATEGORIES = [
  "Shoes",
  "Sandals",
  "Weapon - Arcane",
  "Weapon - Bow",
  "Robes",
  "Plate armor",
  "Hoods",
  "Helmets",
  "Capes",
] as const;

export type RayenCraftingCategory = (typeof RAYEN_CRAFTING_CATEGORIES)[number];

/**
 * The deliberately small equipment catalog selected from the RAYEN workbook.
 * The workbook has lookup data for many other items, but they do not belong
 * on this crafting page.
 */
export function getRayenCraftingCategory(itemId: string): RayenCraftingCategory | null {
  const id = itemId.trim().toUpperCase().replace(/@\d+$/, "");
  const baseId = id.replace(/^T\d+_/, "");

  if (baseId.startsWith("SHOES_LEATHER_") && !baseId.includes("GATHERER")) return "Shoes";
  if (baseId.startsWith("SHOES_CLOTH_") && !baseId.includes("GATHERER")) return "Sandals";
  if (/^(MAIN|2H)_[A-Z0-9_]*ARCANE[A-Z0-9_]*$/.test(baseId)) return "Weapon - Arcane";
  if (/^2H_(BOW|WARBOW|LONGBOW)(_|$)/.test(baseId)) return "Weapon - Bow";
  if (baseId.startsWith("ARMOR_CLOTH_") && !baseId.includes("GATHERER")) return "Robes";
  if (baseId.startsWith("ARMOR_PLATE_") && !baseId.includes("GATHERER")) return "Plate armor";
  if (baseId.startsWith("HEAD_LEATHER_") && !baseId.includes("GATHERER")) return "Hoods";
  if (baseId.startsWith("HEAD_PLATE_") && !baseId.includes("GATHERER")) return "Helmets";
  if (/(^|_)CAPE(ITEM)?(_|$)/.test(baseId)) return "Capes";
  return null;
}
