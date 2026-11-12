import { describe, expect, it } from "vitest";
import { ScannerSession } from "./scanner-session";

describe("scanner session ownership", () => {
  it.each(["scan", "restore"] as const)("rejects late %s callbacks through rapid A-B-A transitions", (kind) => {
    const session = new ScannerSession<string>();
    session.select("A");
    const old = session.begin(kind)!;
    session.select("B");
    expect(old.controller.signal.aborted).toBe(true);
    session.select("A");
    const current = session.begin(kind)!;
    expect(session.accepts(old)).toBe(false);
    expect(session.finish(old)).toBe(false);
    expect(session.accepts(current)).toBe(true);
  });
  it("caches complete market pools and leaves cold/failed restores empty", () => {
    const session = new ScannerSession<string>();
    session.select("A");
    const scan = session.begin("scan")!;
    session.save(scan, "all qualities and refreshed prices");
    session.finish(scan);
    expect(session.select("B")).toBeUndefined();
    const restore = session.begin("restore")!;
    session.finish(restore); // 404 or failure: no save
    expect(session.select("A")).toBe("all qualities and refreshed prices");
    expect(session.select("B")).toBeUndefined();
  });
  it("cancels restore on manual scan, releases cancelled locks immediately and ignores old finally", () => {
    const session = new ScannerSession<string>();
    session.select("A");
    const restore = session.begin("restore")!;
    const scan = session.begin("scan")!;
    expect(session.accepts(restore)).toBe(false);
    expect(session.begin("scan")).toBeUndefined(); // busy does not consume work
    session.cancel();
    const retry = session.begin("scan")!;
    expect(session.finish(scan)).toBe(false);
    expect(session.accepts(retry)).toBe(true);
  });
});
