import { jsonResponse } from "@/lib/api/json";
import { readJsonBody } from "@/lib/api/request";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { credentialsSchema, isSameOriginRequest } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Invalid request origin." }, { status: 403 });
  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse({ error: body.error }, { status: body.status });
  const parsed = credentialsSchema.safeParse(body.value);
  if (!parsed.success || !parsed.data.displayName) {
    return jsonResponse({ error: "Enter a valid name, email, and password of at least 12 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) return jsonResponse({ error: "An account with this email already exists." }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (transaction) => {
    const created = await transaction.user.create({
      data: { email: parsed.data.email, displayName: parsed.data.displayName, passwordHash },
      select: { id: true, email: true, displayName: true },
    });
    await Promise.all([
      transaction.userSetting.create({ data: { userId: created.id } }),
      transaction.transportProfile.create({ data: { userId: created.id, name: "Default Transport" } }),
      transaction.craftProfile.create({ data: { userId: created.id, name: "Default Crafting" } }),
    ]);
    return created;
  });
  await createSession(user.id);
  return jsonResponse({ user }, { status: 201 });
}
