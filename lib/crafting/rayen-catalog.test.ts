import { describe, expect, it } from "vitest";

import { getRayenCraftingCategory } from "./rayen-catalog";

describe("RAYEN crafting catalog", () => {
  it.each([
    ["T4_SHOES_LEATHER_SET3", "Shoes"],
    ["T6_SHOES_CLOTH_AVALON@2", "Sandals"],
    ["T5_MAIN_ARCANESTAFF", "Weapon - Arcane"],
    ["T8_2H_ARCANE_RINGPAIR_AVALON", "Weapon - Arcane"],
    ["T7_2H_BOW_HELL@3", "Weapon - Bow"],
    ["T4_ARMOR_CLOTH_SET2", "Robes"],
    ["T8_ARMOR_PLATE_AVALON", "Plate armor"],
    ["T6_HEAD_LEATHER_FEY", "Hoods"],
    ["T7_HEAD_PLATE_SET1", "Helmets"],
    ["T4_CAPE", "Capes"],
    ["T8_CAPEITEM_FW_LYMHURST", "Capes"],
  ] as const)("classifies %s", (itemId, category) => {
    expect(getRayenCraftingCategory(itemId)).toBe(category);
  });

  it.each([
    "T4_MEAL_STEW",
    "T4_POTION_HEAL",
    "T4_2H_CROSSBOW",
    "T4_ARMOR_LEATHER_SET1",
    "T4_SHOES_PLATE_SET1",
    "T4_HEAD_GATHERER_HIDE",
    "T4_MAIN_SWORD",
  ])("excludes unsupported output %s", (itemId) => {
    expect(getRayenCraftingCategory(itemId)).toBeNull();
  });
});
