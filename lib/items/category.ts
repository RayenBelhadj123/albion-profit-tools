export const ITEM_CATEGORIES = [
  "Equipment",
  "Resources",
  "Refined resources",
  "Consumables",
  "Mounts",
  "Artifacts",
  "Journals",
  "Farming",
  "Other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export function getItemCategory(itemId: string): ItemCategory {
  const id = itemId.toUpperCase().replace(/@\d$/, "");

  if (/(^|_)(HEAD|ARMOR|SHOES|MAIN|OFF|CAPE|BAG)(_|$)/.test(id)) {
    return "Equipment";
  }
  if (/(^|_)(ORE|HIDE|FIBER|WOOD|ROCK)(_|$)/.test(id)) {
    return "Resources";
  }
  if (/(^|_)(METALBAR|LEATHER|CLOTH|PLANKS?|STONEBLOCK)(_|$)/.test(id)) {
    return "Refined resources";
  }
  if (/(POTION|MEAL|FOOD|FISHSAUCE)/.test(id)) return "Consumables";
  if (/(MOUNT|_HORSE_|_OX_|_BABY$|_GROWN$)/.test(id)) return "Mounts";
  if (/(ARTEFACT|ARTIFACT|RUNE|SOUL|RELIC|AVALONIAN_SHARD)/.test(id)) {
    return "Artifacts";
  }
  if (/JOURNAL/.test(id)) return "Journals";
  if (/(FARM|SEED|SAPLING)/.test(id)) return "Farming";
  return "Other";
}
