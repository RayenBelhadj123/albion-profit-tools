import { describe, expect, it } from "vitest";
import { getConsumableCategory, getConsumableFamily } from "./consumable-catalog";

describe("consumable catalog", () => {
  it("classifies food and potions", () => {
    expect(getConsumableCategory("T4_MEAL_STEW")).toBe("Food");
    expect(getConsumableCategory("T6_POTION_HEAL@1")).toBe("Potions");
  });
  it("excludes equipment and ingredients", () => {
    expect(getConsumableCategory("T4_ARMOR_CLOTH_SET1")).toBeNull();
    expect(getConsumableCategory("T4_FISHSAUCE_LEVEL1")).toBeNull();
  });
});

describe("consumable families", () => {
  it.each([
    ["T4_MEAL_STEW", "Stews"],
    ["T6_MEAL_OMELETTE@1", "Omelettes"],
    ["T8_POTION_HEAL", "Healing potions"],
    ["T7_POTION_POISON@2", "Poison potions"],
  ])("classifies %s", (itemId, family) => {
    expect(getConsumableFamily(itemId)).toBe(family);
  });

  it("rejects equipment", () => {
    expect(getConsumableFamily("T6_MAIN_SWORD")).toBeNull();
  });
});
