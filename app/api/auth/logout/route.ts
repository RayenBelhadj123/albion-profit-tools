import { deleteSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/validation";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return new Response(null, { status: 403 });
  await deleteSession();
  return Response.redirect(new URL("/", request.url), 303);
}
