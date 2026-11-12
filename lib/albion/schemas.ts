import { z } from "zod";

const nullableApiDateSchema = z
  .string()
  .nullable()
  .transform((value) => {
    if (!value || value.startsWith("0001-01-01")) {
      return null;
    }

    const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  });

export const albionCurrentPriceSchema = z
  .object({
    item_id: z.string().min(1),
    city: z.string().min(1),
    quality: z.number().int().positive(),
    sell_price_min: z.number().int().nonnegative(),
    sell_price_min_date: nullableApiDateSchema,
    sell_price_max: z.number().int().nonnegative(),
    sell_price_max_date: nullableApiDateSchema,
    buy_price_min: z.number().int().nonnegative(),
    buy_price_min_date: nullableApiDateSchema,
    buy_price_max: z.number().int().nonnegative(),
    buy_price_max_date: nullableApiDateSchema,
  })
  .passthrough();

export const albionCurrentPriceResponseSchema = z.array(
  albionCurrentPriceSchema,
);

export type AlbionCurrentPriceApiRow = z.output<
  typeof albionCurrentPriceSchema
>;

export const albionHistoryPriceSchema = z.object({
  location: z.string().min(1),
  item_id: z.string().min(1),
  quality: z.number().int().positive(),
  data: z.array(z.object({
    item_count: z.number().int().nonnegative(),
    avg_price: z.number().int().nonnegative(),
    timestamp: nullableApiDateSchema,
  }).passthrough()),
}).passthrough();

export const albionHistoryPriceResponseSchema = z.array(albionHistoryPriceSchema);

export type AlbionHistoryPriceApiRow = z.output<typeof albionHistoryPriceSchema>;
