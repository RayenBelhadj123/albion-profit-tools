import { z } from "zod";

const localizedNamesSchema = z.record(z.string(), z.string());

export const localizedItemSchema = z.looseObject({
  UniqueName: z.string().min(1),
  LocalizedNames: localizedNamesSchema.nullish(),
});

export const localizedItemCatalogSchema = z.array(localizedItemSchema);

export type LocalizedItem = z.infer<typeof localizedItemSchema>;

export function buildEnglishItemNameMap(
  items: readonly LocalizedItem[],
): Map<string, string> {
  const names = new Map<string, string>();

  for (const item of items) {
    const englishName = item.LocalizedNames?.["EN-US"]?.trim();
    if (englishName) names.set(item.UniqueName, englishName);
  }

  return names;
}

export function resolveEnglishItemName(
  itemId: string,
  names: ReadonlyMap<string, string>,
): string {
  return (
    names.get(itemId) ??
    names.get(itemId.replace(/@\d+$/, "")) ??
    readableItemId(itemId)
  );
}

function readableItemId(itemId: string): string {
  return itemId
    .replace(/@\d+$/, "")
    .replace(/^T\d_/, "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
