import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomUUID } from "node:crypto";

import { PrismaClient } from "@/app/generated/prisma/client";
import { resolveDirectDatabaseUrl } from "@/lib/db/database-url";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: ReturnType<typeof createPrismaClient>;
};
const statementPrefix = randomUUID().replaceAll("-", "").slice(0, 12);
let statementCounter = 0;

function createPrismaClient() {
  const connectionString = resolveDirectDatabaseUrl(env.DATABASE_URL);
  const databaseUrl = new URL(connectionString);
  const configuredLimit = Number(databaseUrl.searchParams.get("connection_limit"));
  const poolLimit = databaseUrl.hostname === "localhost"
    ? 1
    : Number.isInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : undefined;
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString,
        max: poolLimit,
      },
      {
        statementNameGenerator: databaseUrl.hostname === "localhost"
          ? ({ sql }) => {
              statementCounter += 1;
              const queryHash = createHash("sha256").update(sql).digest("hex").slice(0, 16);
              return `prisma_${statementPrefix}_${statementCounter.toString(36)}_${queryHash}`;
            }
          : undefined,
      },
    ),
  });
}

function hasCurrentModelDelegates(client: ReturnType<typeof createPrismaClient> | undefined) {
  if (!client) return false;
  const runtimeClient = client as unknown as Record<string, { findMany?: unknown } | undefined>;
  return ["item", "route", "marketPriceCache", "marketPriceObservation", "privateMarketObservation"]
    .every((model) => typeof runtimeClient[model]?.findMany === "function");
}

// Next.js development hot reload keeps globalThis alive. Reject a Prisma
// client generated from an older schema instead of reusing missing delegates.
const cachedPrisma = globalForPrisma.prisma;
export const prisma = hasCurrentModelDelegates(cachedPrisma) ? cachedPrisma! : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
