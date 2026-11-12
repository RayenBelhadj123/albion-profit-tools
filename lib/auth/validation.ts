import { z } from "zod";

export const credentialsSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(50).optional(),
});

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}
