import { describe, expect, it } from "vitest";

import {
  buildEnglishItemNameMap,
  resolveEnglishItemName,
} from "./localized-names";

describe("localized item names", () => {
  const names = buildEnglishItemNameMap([
    {
      UniqueName: "T4_BAG",
      LocalizedNames: { "EN-US": "Adept's Bag" },
    },
    {
      UniqueName: "T4_BAG@2",
      LocalizedNames: { "EN-US": "Adept's Bag" },
    },
    {
      UniqueName: "T4_2H_HOLYSTAFF",
      LocalizedNames: { "EN-US": "Adept's Great Holy Staff" },
    },
  ]);

  it("uses the exact localized name for a base item", () => {
    expect(resolveEnglishItemName("T4_BAG", names)).toBe("Adept's Bag");
  });

  it("uses the exact localized name for an enchanted item", () => {
    expect(resolveEnglishItemName("T4_BAG@2", names)).toBe("Adept's Bag");
  });

  it("falls back to the base localization if an enchantment record is absent", () => {
    expect(resolveEnglishItemName("T4_2H_HOLYSTAFF@4", names)).toBe(
      "Adept's Great Holy Staff",
    );
  });

  it("keeps an item-id fallback for metadata without English localization", () => {
    expect(resolveEnglishItemName("T8_UNKNOWN_ITEM@1", names)).toBe(
      "Unknown Item",
    );
  });
});
