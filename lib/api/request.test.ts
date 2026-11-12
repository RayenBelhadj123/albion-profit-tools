import { describe, expect, it } from "vitest";

import { readJsonBody } from "./request";

describe("readJsonBody", () => {
  it("parses a JSON object", async () => {
    const result = await readJsonBody(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ runs: 10 }),
    }));
    expect(result).toEqual({ ok: true, value: { runs: 10 } });
  });

  it("rejects malformed JSON", async () => {
    const result = await readJsonBody(new Request("https://example.test", {
      method: "POST",
      body: "{",
    }));
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects bodies over the byte limit", async () => {
    const result = await readJsonBody(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ value: "abcd" }),
    }), 4);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});
