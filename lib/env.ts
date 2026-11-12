import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ALBION_DEFAULT_SERVER: z
    .enum(["EUROPE", "AMERICAS", "ASIA"])
    .default("EUROPE"),
  ALBION_API_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  ALBION_MAX_DATA_AGE_MINUTES: z.coerce.number().int().positive().default(60),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsedEnv.data;
