export class CsvImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvImportError";
  }
}

const requiredHeaders = ["server", "itemid", "city", "quality", "ordertype", "price", "observedat"] as const;

export function parseMarketObservationCsv(text: string): unknown[] {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new CsvImportError("CSV must contain a header and at least one data row.");
  const headers = records[0].map(normalizeHeader);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new CsvImportError(`Missing CSV columns: ${missing.join(", ")}.`);
  const rows = records.slice(1).filter((record) => record.some((value) => value.trim() !== ""));
  if (rows.length > 500) throw new CsvImportError("CSV imports are limited to 500 observations at a time.");

  return rows.map((record, index) => {
    const value = (header: string) => record[headers.indexOf(header)]?.trim() ?? "";
    const quantity = value("availablequantity") || value("quantity");
    const expiresAt = value("expiresat");
    return {
      server: value("server").toUpperCase(),
      itemId: value("itemid").toUpperCase(),
      city: value("city").replaceAll(" ", "_").toUpperCase(),
      quality: Number(value("quality")),
      orderType: value("ordertype").toUpperCase(),
      price: value("price"),
      availableQuantity: quantity ? Number(quantity) : null,
      observedAt: value("observedat"),
      expiresAt: expiresAt || null,
      preferredOverride: parseBoolean(value("preferredoverride")),
      note: value("note") || `Spreadsheet row ${index + 2}`,
    };
  });
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function parseBoolean(value: string) {
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(field); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field); field = "";
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
    } else field += character;
  }
  if (quoted) throw new CsvImportError("CSV contains an unclosed quoted field.");
  record.push(field);
  if (record.some((value) => value.length > 0)) records.push(record);
  return records;
}
