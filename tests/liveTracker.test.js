import { beforeEach, expect, it, vi } from "vitest";

// Minimal hook runtime: effects are collected and run by the test, refs persist across renders.
const h = vi.hoisted(() => ({ refs: [], effects: [], i: 0, path: "/", cart: { cartItems: [], subtotal: 0 } }));
vi.mock("react", () => ({
  useRef: (init) => { const k = h.i++; if (!h.refs[k]) h.refs[k] = { current: init }; return h.refs[k]; },
  useEffect: (fn, deps) => { h.effects.push({ fn, deps }); },
}));
vi.mock("next/navigation", () => ({ usePathname: () => h.path }));
vi.mock("../src/context/CartContext", () => ({ useCart: () => h.cart }));
vi.mock("@/lib/firebase", () => ({ getRtdb: () => ({}) }));
const db = vi.hoisted(() => ({ ops: [], connectedCb: null }));
vi.mock("firebase/database", () => ({
  ref: (_d, p) => ({ p }),
  set: vi.fn((r, v) => { db.ops.push(["set", r.p, v.path, v.status]); return Promise.resolve(); }),
  remove: vi.fn((r) => { db.ops.push(["remove", r.p]); return Promise.resolve(); }),
  onDisconnect: vi.fn((r) => ({ remove: () => { db.ops.push(["onDisconnect.remove", r.p]); return Promise.resolve(); } })),
  onValue: vi.fn((r, cb) => { if (r.p === ".info/connected") db.connectedCb = cb; return () => db.ops.push(["unsub"]); }),
  serverTimestamp: () => ({ ".sv": "timestamp" }),
}));

import LiveTracker from "@/components/LiveTracker";

let store, hidden, listeners;
const depsEqual = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
let mounted = [];
function render() {
  h.i = 0; h.effects = [];
  LiveTracker();
  h.effects.forEach((e, idx) => {
    const prev = mounted[idx];
    if (prev && depsEqual(prev.deps, e.deps)) return;
    if (prev?.cleanup) prev.cleanup();
    mounted[idx] = { deps: e.deps, cleanup: e.fn() };
  });
}
beforeEach(() => {
  vi.clearAllTimers(); vi.useFakeTimers(); h.refs = []; mounted = []; db.ops = []; db.connectedCb = null;
  h.path = "/"; h.cart = { cartItems: [], subtotal: 0 }; store = {}; hidden = false; listeners = {};
  globalThis.sessionStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.window = { innerWidth: 1200 };
  globalThis.document = { get hidden() { return hidden; }, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: () => {} };
});
const count = (op) => db.ops.filter((o) => o[0] === op).length;

it("registers onDisconnect once and publishes once on connect", () => {
  render(); db.connectedCb({ val: () => true });
  expect(count("onDisconnect.remove")).toBe(1); expect(count("set")).toBe(1);
});
it("navigation and cart changes do not remove the visitor or re-register onDisconnect", () => {
  render(); db.connectedCb({ val: () => true }); db.ops = [];
  h.path = "/products/a"; render();
  h.path = "/checkout"; h.cart = { cartItems: [{}], subtotal: 100 }; render();
  expect(count("remove")).toBe(0); expect(count("onDisconnect.remove")).toBe(0);
  expect(db.ops.filter((o) => o[0] === "set").map((o) => [o[2], o[3]])).toEqual([["/products/a", "browsing"], ["/checkout", "checkout"]]);
});
it("heartbeat every 30 s while visible", () => {
  render(); db.connectedCb({ val: () => true }); db.ops = [];
  vi.advanceTimersByTime(90000); expect(count("set")).toBe(3);
});
it("hidden tab sends nothing, and the pending update is sent when visible again", () => {
  render(); db.connectedCb({ val: () => true }); db.ops = [];
  hidden = true; vi.advanceTimersByTime(60000); expect(count("set")).toBe(0);
  hidden = false; listeners.visibilitychange(); expect(count("set")).toBe(1);
});
it("re-registers onDisconnect after a reconnect", () => {
  render(); db.connectedCb({ val: () => true });
  db.connectedCb({ val: () => false }); db.connectedCb({ val: () => true });
  expect(count("onDisconnect.remove")).toBe(2); expect(count("set")).toBe(2);
});
it("admin pages are never tracked, and entering admin removes the visitor", () => {
  render(); db.connectedCb({ val: () => true }); db.ops = [];
  h.path = "/admin/orders"; render();
  expect(count("remove")).toBe(1);
  mounted = []; db.ops = []; h.refs = []; render(); expect(count("set")).toBe(0);
});
it("thank-you page keeps the purchased node when the component unmounts", () => {
  h.path = "/thank-you"; render(); db.connectedCb({ val: () => true }); db.ops = [];
  mounted.forEach((m) => m?.cleanup && m.cleanup());
  expect(count("remove")).toBe(0);
});
