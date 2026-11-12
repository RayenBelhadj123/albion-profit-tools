import { describe, expect, it } from "vitest";
import { CsvImportError, parseMarketObservationCsv } from "./csv-import";

describe("market observation CSV import", () => {
  it("parses spreadsheet exports including quoted notes", () => {
    const [row] = parseMarketObservationCsv("server,itemId,city,quality,orderType,price,quantity,observedAt,preferredOverride,note\r\nEUROPE,T4_BAG,Fort Sterling,1,SELL,1250,30,2026-08-11T09:30:00Z,true,\"shop, checked\"");
    expect(row).toEqual(expect.objectContaining({
      itemId: "T4_BAG", city: "FORT_STERLING", price: "1250",
      availableQuantity: 30, preferredOverride: true, note: "shop, checked",
    }));
  });

  it("rejects a sheet without required columns", () => {
    expect(() => parseMarketObservationCsv("itemId,price\nT4_BAG,1000")).toThrow(CsvImportError);
  });
});
