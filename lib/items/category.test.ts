import { describe, expect, it } from "vitest";

import { getItemCategory } from "./category";

describe("getItemCategory", () => {
  it("classifies common marketplace item IDs", () => {
    expect(getItemCategory("T4_MAIN_SWORD")).toBe("Equipment");
    expect(getItemCategory("T6_HIDE")).toBe("Resources");
    expect(getItemCategory("T5_LEATHER@2")).toBe("Refined resources");
    expect(getItemCategory("T7_POTION_HEAL")).toBe("Consumables");
    expect(getItemCategory("T5_MOUNT_HORSE")).toBe("Mounts");
    expect(getItemCategory("T4_JOURNAL_WARRIOR_FULL")).toBe("Journals");
  });

  it("keeps unknown IDs in Other", () => {
    expect(getItemCategory("UNIQUE_EVENT_TOKEN")).toBe("Other");
  });
});
