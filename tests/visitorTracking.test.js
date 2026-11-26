import { describe, expect, it, vi } from "vitest";
import { createVisitorRecorder } from "@/lib/visitorTracking";

const inc = n => ({ __increment: n });
const silentLog = { log: () => {}, warn: () => {}, error: () => {} };

function makeDeps({ eventDoc, eventGetError, settingsDoc } = {}) {
  const refs = {};
  const doc = vi.fn((db, col, id) => {
    const path = `${col}/${id}`;
    refs[path] = refs[path] || { path };
    return refs[path];
  });
  const getDoc = vi.fn(async ref => {
    if (ref.path.startsWith("visitor_events/")) {
      if (eventGetError) throw eventGetError;
      return { exists: () => !!eventDoc, data: () => eventDoc || {} };
    }
    return { exists: () => !!settingsDoc, data: () => settingsDoc || {} };
  });
  const setDoc = vi.fn(async () => {});
  const updateDoc = vi.fn(async () => {});
  const increment = vi.fn(inc);
  return { db: {}, doc, getDoc, setDoc, updateDoc, increment, now: () => "2026-11-26 14:30:00", log: silentLog };
}

const visit = { sessionId: "vis_abc", todayStr: "2026-11-26", page: "/checkout", context: { device: "Mobile" }, markCounted: vi.fn() };
const denied = () => { const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; return e; };

describe("createVisitorRecorder", () => {
  it("records event + counters when the read says the event does not exist (current rules)", async () => {
    const deps = makeDeps({ settingsDoc: { counters: { todayDate: "2026-11-26" } } });
    const markCounted = vi.fn();
    await createVisitorRecorder(deps)({ ...visit, markCounted });
    expect(deps.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = deps.setDoc.mock.calls[0];
    expect(ref.path).toBe("visitor_events/vis_abc_2026-11-26");
    expect(data.sessionId).toBe("vis_abc");
    expect(deps.updateDoc).toHaveBeenCalledTimes(1);
    const [, updates] = deps.updateDoc.mock.calls[0];
    expect(updates["counters.visitors"]).toEqual({ __increment: 1 });
    expect(updates["counters.todayVisitors"]).toEqual({ __increment: 1 });
    expect(markCounted).toHaveBeenCalled();
  });

  it("does nothing but mark counted when the event already exists", async () => {
    const deps = makeDeps({ eventDoc: { sessionId: "vis_abc" } });
    const markCounted = vi.fn();
    await createVisitorRecorder(deps)({ ...visit, markCounted });
    expect(deps.setDoc).not.toHaveBeenCalled();
    expect(deps.updateDoc).not.toHaveBeenCalled();
    expect(markCounted).toHaveBeenCalled();
  });

  it("treats permission-denied on the existence check as a new visit (locked rules)", async () => {
    const deps = makeDeps({ eventGetError: denied(), settingsDoc: { counters: { todayDate: "2026-11-26" } } });
    const markCounted = vi.fn();
    await createVisitorRecorder(deps)({ ...visit, markCounted });
    expect(deps.setDoc).toHaveBeenCalledTimes(1); // create attempt
    expect(deps.updateDoc).toHaveBeenCalledTimes(1); // counters still update
    const [, updates] = deps.updateDoc.mock.calls[0];
    expect(updates["counters.visitors"]).toEqual({ __increment: 1 });
    expect(updates["counters.todayVisitors"]).toEqual({ __increment: 1 });
    expect(markCounted).toHaveBeenCalled();
  });

  it("still updates counters and marks counted when the event create is rejected (existing doc under lock)", async () => {
    const deps = makeDeps({ eventGetError: denied(), settingsDoc: { counters: { todayDate: "2026-11-26" } } });
    deps.setDoc = vi.fn(async () => { throw denied(); });
    const markCounted = vi.fn();
    await createVisitorRecorder(deps)({ ...visit, markCounted });
    expect(deps.setDoc).toHaveBeenCalledTimes(1);
    expect(deps.updateDoc).toHaveBeenCalledTimes(1); // counters unaffected by event rejection
    expect(markCounted).toHaveBeenCalled();
  });

  it("falls back to visitors-only increment on non-permission read errors", async () => {
    const deps = makeDeps({ eventGetError: new Error("network down") });
    const markCounted = vi.fn();
    await createVisitorRecorder(deps)({ ...visit, markCounted });
    expect(deps.setDoc).not.toHaveBeenCalled();
    expect(deps.updateDoc).toHaveBeenCalledTimes(1);
    const [, updates] = deps.updateDoc.mock.calls[0];
    expect(updates).toEqual({ "counters.visitors": { __increment: 1 } });
    expect(markCounted).toHaveBeenCalled();
  });

  it("resets todayVisitors and carries yesterday on a new day", async () => {
    const deps = makeDeps({ settingsDoc: { counters: { todayDate: "2026-11-25", todayVisitors: 42 } } });
    const markCounted = vi.fn();
    await createVisitorRecorder(deps)({ ...visit, markCounted });
    const [, updates] = deps.updateDoc.mock.calls[0];
    expect(updates["counters.todayVisitors"]).toBe(1);
    expect(updates["counters.yesterdayVisitors"]).toBe(42);
    expect(updates["counters.todayDate"]).toBe("2026-11-26");
  });
});
