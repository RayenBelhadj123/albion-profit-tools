import { describe, expect, it } from "vitest";

import { findRefiningRecipe, refiningRecipes } from "./recipes";

describe("refining recipe catalog", () => {
  it("contains every resource line, tier, and enchantment", () => {
    expect(refiningRecipes).toHaveLength(125);
    expect(new Set(refiningRecipes.map((recipe) => recipe.resourceType)).size).toBe(5);
    expect(new Set(refiningRecipes.map((recipe) => recipe.tier))).toEqual(new Set([4, 5, 6, 7, 8]));
    expect(new Set(refiningRecipes.map((recipe) => recipe.enchantment))).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it("builds enchanted raw, output, and previous-tier item IDs", () => {
    const recipe = findRefiningRecipe("refine-t7-cloth-3");
    expect(recipe?.outputItemId).toBe("T7_CLOTH_LEVEL3@3");
    expect(recipe?.ingredients.map((ingredient) => ingredient.itemId)).toEqual([
      "T7_FIBER_LEVEL3@3",
      "T6_CLOTH_LEVEL3@3",
    ]);
  });

  it("keeps old leather recipe links working", () => {
    expect(findRefiningRecipe("refine-t4-leather")?.id).toBe("refine-t4-leather-0");
  });
});
