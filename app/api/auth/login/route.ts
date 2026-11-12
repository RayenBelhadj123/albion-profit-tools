import { jsonResponse } from "@/lib/api/json";
import { readJsonBody } from "@/lib/api/request";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { credentialsSchema, isSameOriginRequest } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Invalid request origin." }, { status: 403 });
  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse({ error: body.error }, { status: body.status });
  const parsed = credentialsSchema.omit({ displayName: true }).safeParse(body.value);
  if (!parsed.success) return jsonResponse({ error: "Invalid email or password." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, displayName: true, passwordHash: true },
  });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonResponse({ error: "Invalid email or password." }, { status: 401 });
  }
  await createSession(user.id);
  return jsonResponse({ user: { id: user.id, email: user.email, displayName: user.displayName } });
}
