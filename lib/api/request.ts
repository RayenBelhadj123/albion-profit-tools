export const DEFAULT_MAX_JSON_BYTES = 16 * 1024;

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
      return { ok: false, status: 400, error: "Invalid Content-Length header." };
    }
    if (declaredBytes > maxBytes) {
      return { ok: false, status: 413, error: "Request body is too large." };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Could not read request body." };
  }

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON." };
  }
}
