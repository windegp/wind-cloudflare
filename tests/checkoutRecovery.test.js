import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/durablePayments", () => ({ PAYMENT_RECEIPTS: "WindPaymentReceipts", processPaymentReceipt: vi.fn(async () => ({ state: "applied" })) }));
vi.mock("@/lib/checkoutOutbox", () => ({ processCheckoutJob: vi.fn(async () => ({ state: "sent" })) }));
import { runCheckoutRecovery } from "@/lib/checkoutRecovery";
import { processPaymentReceipt } from "@/lib/durablePayments";
import { processCheckoutJob } from "@/lib/checkoutOutbox";
beforeEach(() => vi.clearAllMocks());
it("queries receipts before due jobs, includes expired processing leases, and limits work", async () => {
  const store = { listDue: vi.fn(async c => c === "WindPaymentReceipts" ? [{ id: "r1" }] : [{ id: "j1" }]) };
  expect(await runCheckoutRecovery({ store })).toMatchObject({ receipts: 1, jobs: 1, errors: 0 });
  expect(store.listDue.mock.calls[1][1]).toMatchObject({ states: ["pending", "retry", "processing"], limit: 10 });
});
it("one job error does not hide the remaining jobs or return all-clear", async () => {
  const store = { listDue: vi.fn(async c => c === "WindPaymentReceipts" ? [] : [{ id: "j1" }, { id: "j2" }]) };
  processCheckoutJob.mockRejectedValueOnce(new Error("failed"));
  expect(await runCheckoutRecovery({ store })).toMatchObject({ jobs: 1, errors: 1 });
});
it("zero budget executes no downstream work", async () => {
  const store = { listDue: vi.fn(async () => [{ id: "r1" }]) };
  expect(await runCheckoutRecovery({ store, budgetMs: 0 })).toMatchObject({ budgetExhausted: true }); expect(processPaymentReceipt).not.toHaveBeenCalled();
});
