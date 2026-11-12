export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      ...init?.headers,
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
    },
  });
}

export function serializeForJson(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeForJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeForJson(nestedValue),
      ]),
    );
  }

  return value;
}
