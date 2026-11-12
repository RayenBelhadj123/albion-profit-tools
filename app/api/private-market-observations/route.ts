import { z } from "zod";

import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { CsvImportError, parseMarketObservationCsv } from "@/lib/market/csv-import";

export const dynamic = "force-dynamic";

const observationSchema = z.strictObject({
  server: z.enum(["EUROPE", "AMERICAS", "ASIA"]),
  itemId: z.string().trim().toUpperCase().min(1).max(100).regex(/^[A-Z0-9_@]+$/),
  city: z.enum(["BRIDGEWATCH", "BLACK_MARKET", "CAERLEON", "FORT_STERLING", "LYMHURST", "MARTLOCK", "THETFORD"]),
  quality: z.coerce.number().int().min(1).max(5),
  orderType: z.enum(["BUY", "SELL"]),
  price: z.coerce.bigint().positive().max(1_000_000_000_000n),
  availableQuantity: z.coerce.number().int().positive().max(1_000_000_000).nullable().optional(),
  observedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  preferredOverride: z.boolean().default(false),
  note: z.string().trim().max(500).nullable().optional(),
});

const importSchema = z.strictObject({
  source: z.enum(["MANUAL", "CSV_IMPORT"]),
  observations: z.array(observationSchema).min(1).max(500),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonResponse({ error: "Sign in to view private market data." }, { status: 401 });
  const observations = await prisma.privateMarketObservation.findMany({
    where: { userId: user.id },
    select: {
      id: true, server: true, itemId: true, city: true, quality: true,
      orderType: true, price: true, availableQuantity: true, observedAt: true,
      expiresAt: true, source: true, preferredOverride: true, note: true,
    },
    orderBy: { observedAt: "desc" },
    take: 500,
  });
  return jsonResponse(serializeForJson({ observations }));
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Cross-origin request rejected." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return jsonResponse({ error: "Sign in before importing private market data." }, { status: 401 });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  let importValue: unknown;
  if (contentType === "text/csv" || contentType === "application/csv") {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > 256 * 1024) return jsonResponse({ error: "CSV is too large." }, { status: 413 });
    const csv = await request.text();
    if (new TextEncoder().encode(csv).byteLength > 256 * 1024) return jsonResponse({ error: "CSV is too large." }, { status: 413 });
    try {
      importValue = { source: "CSV_IMPORT", observations: parseMarketObservationCsv(csv) };
    } catch (error) {
      return jsonResponse({ error: error instanceof CsvImportError ? error.message : "Could not parse CSV." }, { status: 400 });
    }
  } else {
    const body = await readJsonBody(request, 256 * 1024);
    if (!body.ok) return jsonResponse({ error: body.error }, { status: body.status });
    importValue = body.value;
  }
  const parsed = importSchema.safeParse(importValue);
  if (!parsed.success) return jsonResponse({ error: "Invalid private observations.", issues: parsed.error.issues }, { status: 400 });
  const itemIds = [...new Set(parsed.data.observations.map((row) => row.itemId))];
  const existingItems = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
  const existingIds = new Set(existingItems.map((item) => item.id));
  const missingItemIds = itemIds.filter((id) => !existingIds.has(id));
  if (missingItemIds.length > 0) return jsonResponse({ error: "Some item IDs are not in the catalog.", missingItemIds }, { status: 400 });
  const invalidExpiry = parsed.data.observations.find((row) => row.expiresAt && row.expiresAt <= row.observedAt);
  if (invalidExpiry) return jsonResponse({ error: "Expiry must be later than observation time." }, { status: 400 });

  const privateRows = parsed.data.observations.map((row) => ({
      ...row,
      userId: user.id,
      source: parsed.data.source,
      availableQuantity: row.availableQuantity ?? null,
      expiresAt: row.expiresAt ?? null,
      note: row.note ?? null,
  }));
  const collectedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.privateMarketObservation.createMany({ data: privateRows });
    await tx.marketPriceObservation.createMany({
      data: parsed.data.observations.map((row) => ({
        userId: user.id,
        server: row.server,
        itemId: row.itemId,
        city: row.city,
        quality: row.quality,
        orderType: row.orderType,
        price: row.price,
        availableQuantity: row.availableQuantity ?? null,
        observedAt: row.observedAt,
        collectedAt,
        expiresAt: row.expiresAt ?? null,
        source: parsed.data.source === "MANUAL" ? "PRIVATE_MANUAL" : "PRIVATE_IMPORT",
        confidence: privateConfidence(row.observedAt, collectedAt),
        sourceReference: parsed.data.source === "MANUAL" ? "manual-entry" : "spreadsheet-csv",
        metadataJson: row.note ? { note: row.note, preferredOverride: row.preferredOverride } : { preferredOverride: row.preferredOverride },
      })),
    });
    return created;
  });
  return jsonResponse({ imported: result.count }, { status: 201 });
}

function privateConfidence(observedAt: Date, collectedAt: Date) {
  const ageMinutes = Math.max(0, collectedAt.getTime() - observedAt.getTime()) / 60_000;
  if (ageMinutes <= 1_440) return "HIGH" as const;
  if (ageMinutes <= 10_080) return "MEDIUM" as const;
  return "LOW" as const;
}
