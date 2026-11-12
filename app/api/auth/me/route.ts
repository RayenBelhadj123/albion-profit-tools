import { jsonResponse } from "@/lib/api/json";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  return jsonResponse({ user: await getCurrentUser() });
}
