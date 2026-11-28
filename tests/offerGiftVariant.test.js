import { describe, it, expect } from "vitest";
import { sanitizeGiftSelection, sanitizeGiftSelections, freezeGiftSelections, isColorAvailableOnLine } from "@/lib/offerGiftVariant";
import { computeOfferBenefits } from "@/lib/offerEngine";

const offer = { id: "o1", type: "buy_x_get_y", name: "t", active: true, startsAt: "", endsAt: "", config: { buyQty: 3, getQty: 1 } };
const line = (c, size = "", qty = 1) => ({ id: "p1", handle: "p1", price: 100, qty, selectedColor: c, selectedSize: size });
const KEY = "offer-gift:o1:p1";
const benefits = (items) => computeOfferBenefits(items, offer, new Date());
// the color the gift row shows, using the same rule the cart and checkout use
const shown = (items, saved) => {
  const b = benefits(items);
  const unit = b.lines[0].discountedUnits[0];
  return (saved[unit.giftKey] || {}).selectedColor ?? items[b.lines[0].cartIndex].selectedColor;
};

describe("sanitize", () => {
  it("drops empty values so the default can apply", () => {
    expect(sanitizeGiftSelection({ selectedColor: "", selectedSize: "M", image: "" })).toEqual({ selectedSize: "M" });
    expect(sanitizeGiftSelections({ k: { selectedColor: "" }, j: { selectedColor: "red" } })).toEqual({ k: {}, j: { selectedColor: "red" } });
    expect(sanitizeGiftSelections(null)).toEqual({});
    expect(sanitizeGiftSelections([1])).toEqual({});
  });
});

describe("freezeGiftSelections", () => {
  it("saves the shown color and size when none was chosen", () => {
    const items = [line("A", "M"), line("B", "M"), line("C", "M")];
    expect(freezeGiftSelections(benefits(items), items, {})).toEqual({ [KEY]: { selectedColor: "A", selectedSize: "M", frozen: true } });
  });
  it("never overwrites a color the customer chose", () => {
    const items = [line("A"), line("B"), line("C")];
    expect(freezeGiftSelections(benefits(items), items, { [KEY]: { selectedColor: "D" } })).toBeNull();
  });
  it("replaces an empty saved color", () => {
    const items = [line("A", "M"), line("B", "M"), line("C", "M")];
    expect(freezeGiftSelections(benefits(items), items, { [KEY]: { selectedColor: "", selectedSize: "L" } }))
      .toEqual({ [KEY]: { selectedColor: "A", selectedSize: "M", frozen: true } });
  });
  it("does nothing without a gift, without colors, or on bad input", () => {
    expect(freezeGiftSelections(benefits([line("A"), line("B")]), [line("A"), line("B")], {})).toBeNull();
    const noColor = [line(""), line(""), line("")];
    expect(freezeGiftSelections(benefits(noColor), noColor, {})).toBeNull();
    expect(freezeGiftSelections(null, [], {})).toBeNull();
    expect(freezeGiftSelections({ lines: [] }, null, {})).toBeNull();
  });
  it("is idempotent", () => {
    const items = [line("A"), line("B"), line("C")];
    const once = freezeGiftSelections(benefits(items), items, {});
    expect(freezeGiftSelections(benefits(items), items, once)).toBeNull();
  });
  it("gift color stays after the first paid line is edited or removed", () => {
    const before = [line("A"), line("B"), line("C")];
    const saved = freezeGiftSelections(benefits(before), before, {});
    expect(shown(before, saved)).toBe("A");
    const edited = [line("D"), line("B"), line("C")];
    expect(shown(edited, saved)).toBe("A");          // frozen, does not move to D
    expect(shown(edited, {})).toBe("D");             // without freeze it moved
    const removed = [line("B"), line("C"), line("E")];
    expect(shown(removed, saved)).toBe("A");
  });
  it("4 colors, never edited: gift color is fixed at first display", () => {
    const items = [line("A"), line("B"), line("C"), line("D")];
    const saved = freezeGiftSelections(benefits(items), items, {});
    expect(saved[KEY].selectedColor).toBe("A");
    expect(benefits(items).lines[0].discountedUnits).toHaveLength(1); // engine unchanged
  });
});

const V = (color, status, size = "M") => ({ option1Value: color, option2Value: size, inventoryStatus: status });
const withVariants = (c, variants, extra = {}) => ({ ...line(c, "M"), variants, ...extra });
const ALL = [V("A", "OUT_OF_STOCK"), V("B", "IN_STOCK"), V("C", "LOW_STOCK"), V("D", "IN_STOCK")];

describe("availability", () => {
  it("reads the variant status the same way the product page does", () => {
    const l = withVariants("B", ALL);
    expect(isColorAvailableOnLine(l, "A", "M")).toBe(false);
    expect(isColorAvailableOnLine(l, "B", "M")).toBe(true);
    expect(isColorAvailableOnLine(l, "C", "M")).toBe(true);
    expect(isColorAvailableOnLine(l, "Z", "M")).toBe(false);
    expect(isColorAvailableOnLine(line("A"), "A")).toBe(true); // no variants stored: unchanged behavior
    expect(isColorAvailableOnLine({ variants: [{ option1Value: "A", option2Value: "M" }], quantity: 0 }, "A", "M")).toBe(false);
    expect(isColorAvailableOnLine({ variants: [{ option1Value: "A", option2Value: "M" }], quantity: 3 }, "A", "M")).toBe(true);
  });
  it("never freezes an unavailable color: line 0 sold out falls to an available paid color", () => {
    const items = [withVariants("A", ALL), withVariants("B", ALL), withVariants("C", ALL), withVariants("D", ALL)];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY]).toMatchObject({ selectedColor: "B", frozen: true });
  });
  it("saves nothing when no paid color is available (gift behaves as before)", () => {
    const all = [V("A", "OUT_OF_STOCK"), V("B", "OUT_OF_STOCK"), V("C", "TEMP_DISABLED")];
    const items = [withVariants("A", all), withVariants("B", all), withVariants("C", all)];
    expect(freezeGiftSelections(benefits(items), items, {})).toBeNull();
  });
  it("replaces a system-saved color that is no longer available, removes it if none is", () => {
    const items = [withVariants("B", ALL), withVariants("C", ALL), withVariants("D", ALL)];
    const saved = { [KEY]: { selectedColor: "A", selectedSize: "M", frozen: true } };
    expect(freezeGiftSelections(benefits(items), items, saved)[KEY].selectedColor).toBe("B");
    const none = [V("A", "OUT_OF_STOCK"), V("B", "OUT_OF_STOCK"), V("C", "OUT_OF_STOCK")];
    const items2 = [withVariants("A", none), withVariants("B", none), withVariants("C", none)];
    expect(freezeGiftSelections(benefits(items2), items2, { [KEY]: { selectedColor: "A", selectedSize: "M", frozen: true } })).toEqual({});
  });
  it("never touches a color the customer chose, and keeps an available frozen one", () => {
    const items = [withVariants("B", ALL), withVariants("C", ALL), withVariants("D", ALL)];
    expect(freezeGiftSelections(benefits(items), items, { [KEY]: { selectedColor: "A", selectedSize: "M" } })).toBeNull();
    expect(freezeGiftSelections(benefits(items), items, { [KEY]: { selectedColor: "C", selectedSize: "M", frozen: true } })).toBeNull();
  });
  it("is idempotent with availability", () => {
    const items = [withVariants("A", ALL), withVariants("B", ALL), withVariants("C", ALL)];
    const once = freezeGiftSelections(benefits(items), items, {});
    expect(freezeGiftSelections(benefits(items), items, once)).toBeNull();
  });
});

const full = (colors, status = {}) => colors.map((c) => V(c, status[c] || "IN_STOCK"));
const mk = (c, variants, extra = {}) => ({ ...line(c, "M"), variants, ...extra });

describe("gift defaults to a color the customer did not pay for", () => {
  it("buy 3 get 1, 4 colors, customer picked 3 -> the 4th color", () => {
    const v = full(["A", "B", "C", "D"]);
    const items = [mk("A", v), mk("B", v), mk("C", v)];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY]).toMatchObject({ selectedColor: "D", selectedSize: "M", frozen: true });
  });
  it("buy 2 get 1, 3 colors, customer picked 2 -> the 3rd color", () => {
    const offer2 = { ...offer, config: { buyQty: 2, getQty: 1 } };
    const v = full(["A", "B", "C"]);
    const items = [mk("A", v), mk("B", v)];
    const b = computeOfferBenefits(items, offer2, new Date());
    expect(freezeGiftSelections(b, items, {})[KEY]).toMatchObject({ selectedColor: "C", frozen: true });
  });
  it("same color bought 3 times, product has 2 colors -> the other color", () => {
    const v = full(["A", "B"]);
    const items = [mk("A", v, { qty: 3 })];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY]).toMatchObject({ selectedColor: "B" });
  });
  it("fewer colors than needed (all colors are paid) -> falls back to the first paid line color", () => {
    const v = full(["A", "B", "C"]);
    const items = [mk("A", v), mk("B", v), mk("C", v)];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY]).toMatchObject({ selectedColor: "A", frozen: true });
  });
  it("the differing color is sold out -> falls back, never freezes the sold-out color", () => {
    const v = full(["A", "B", "C", "D"], { D: "OUT_OF_STOCK" });
    const items = [mk("A", v), mk("B", v), mk("C", v)];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY]).toMatchObject({ selectedColor: "A" });
    const v2 = full(["A", "B", "C", "D", "E"], { D: "OUT_OF_STOCK" });
    const items2 = [mk("A", v2), mk("B", v2), mk("C", v2)];
    expect(freezeGiftSelections(benefits(items2), items2, {})[KEY]).toMatchObject({ selectedColor: "E" });
  });
  it("a color the customer chose is never changed", () => {
    const v = full(["A", "B", "C", "D"]);
    const items = [mk("A", v), mk("B", v), mk("C", v)];
    expect(freezeGiftSelections(benefits(items), items, { [KEY]: { selectedColor: "B", selectedSize: "M" } })).toBeNull();
  });
  it("stays frozen after a paid line is edited (even to the frozen color)", () => {
    const v = full(["A", "B", "C", "D"]);
    const items = [mk("A", v), mk("B", v), mk("C", v)];
    const saved = freezeGiftSelections(benefits(items), items, {});
    expect(saved[KEY].selectedColor).toBe("D");
    const edited = [mk("D", v), mk("B", v), mk("C", v)];
    expect(freezeGiftSelections(benefits(edited), edited, saved)).toBeNull(); // kept, never moves
    expect(shown(edited, saved)).toBe("D");
  });
  it("the saved gift image is the chosen color's image (swatch url or main image)", () => {
    const v = full(["A", "B", "C", "D"]);
    const extra = { colorSwatches: { D: "https://cdn.example.com/d.jpg" }, mainImage: "https://cdn.example.com/main.jpg" };
    const items = [mk("A", v, extra), mk("B", v, extra), mk("C", v, extra)];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY].image).toBe("https://cdn.example.com/d.jpg");
  });
  it("size position can come first in the variants", () => {
    const v = ["A", "B", "C", "D"].map((c) => ({ option1Value: "M", option2Value: c, inventoryStatus: "IN_STOCK" }));
    const items = [mk("A", v), mk("B", v), mk("C", v)];
    expect(freezeGiftSelections(benefits(items), items, {})[KEY]).toMatchObject({ selectedColor: "D", selectedSize: "M" });
  });
});
