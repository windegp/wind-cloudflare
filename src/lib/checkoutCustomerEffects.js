import { checkoutFingerprint } from "@/lib/durableCheckout";
import { serverOrderStore, OrderStoreError } from "@/lib/serverOrderStore";
import { getCairoTimestamp } from "@/lib/analytics-helpers";

export const CUSTOMER_EFFECTS = "WindCheckoutEffects";
const number = value => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new OrderStoreError("INVALID_CUSTOMER_COUNTER");
  return parsed;
};

/** Ledger + customer + settings commit atomically. Safe under lease expiry or worker replay.
 * Settings CAS avoids overwriting concurrent admin edits. Existing unrelated fields are preserved.
 */
export async function applyCheckoutCustomerEffects({ order }, { store = serverOrderStore, now = getCairoTimestamp } = {}) {
  if (!order || !["confirmed", "paid"].includes(order.status) || !/^WIND-[A-Za-z0-9-]{8,100}$/.test(order.orderId)) throw new OrderStoreError("ORDER_NOT_CONFIRMED");
  const customerId = order.customer?.email;
  if (!customerId || !/^[A-Za-z0-9_.@+-]+$/.test(customerId)) throw new OrderStoreError("INVALID_CUSTOMER_ID");
  const id = await checkoutFingerprint({ orderId: order.orderId, effect: "customer_counters_v1" });
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await store.get(CUSTOMER_EFFECTS, id)) return { replay: true };
    const customer = await store.get("Customers", customerId);
    const settings = await store.get("settings", "siteSettings");
    if (!settings) throw new OrderStoreError("SITE_SETTINGS_NOT_FOUND");
    const orders = number(customer?.data["Total Orders"]);
    const spent = number(customer?.data["Total Spent"]);
    const total = number(order.financials?.total);
    const counters = settings.data.counters || {};
    const segment = orders >= 1 ? "VIP_Customer" : "Purchased_Once";
    const c = order.customer;
    const writes = [
      { collection: CUSTOMER_EFFECTS, id, create: true, data: { orderId: order.orderId, type: "customer_counters", appliedAt: now() } },
      { collection: "Customers", id: customerId, ...(customer ? { version: customer.version, merge: true } : { create: true }), data: {
        "First Name": c.firstName || "", "Last Name": c.lastName || "", Email: customerId, Phone: c.phone || "",
        "Default Address Address1": c.address || "", "Default Address City": c.city || "", "Default Address Province": c.governorate || "",
        "Total Orders": orders + 1, "Total Spent": spent + total,
        Last_Order_Status: order.status === "paid" ? "Paid" : "New", segments: [segment], status: segment, last_active: now(), data_source: "WIND_Web",
      } },
      { collection: "settings", id: "siteSettings", version: settings.version, merge: true, data: { counters: {
        ...counters, orders: number(counters.orders) + 1, sales: number(counters.sales) + total,
        customers: number(counters.customers) + (orders === 0 ? 1 : 0),
      } } },
    ];
    try { await store.commit(writes); return { replay: false }; }
    catch (error) {
      if (await store.get(CUSTOMER_EFFECTS, id)) return { replay: true };
      if (error.code !== "ORDER_WRITE_CONFLICT") throw error;
    }
  }
  throw new OrderStoreError("CUSTOMER_EFFECT_CONTENTION");
}
