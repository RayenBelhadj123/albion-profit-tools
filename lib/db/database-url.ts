import { z } from "zod";

const prismaPostgresApiKeySchema = z.object({
  databaseUrl: z.string().url(),
});

export function resolveDirectDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith("prisma+postgres://")) {
    return databaseUrl;
  }

  const url = new URL(databaseUrl);
  const apiKey = url.searchParams.get("api_key");

  if (!apiKey) {
    throw new Error("Prisma Postgres URL is missing api_key.");
  }

  const decoded = Buffer.from(apiKey, "base64url").toString("utf8");
  const parsed = prismaPostgresApiKeySchema.parse(JSON.parse(decoded));

  return parsed.databaseUrl;
}
