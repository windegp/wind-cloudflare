import { orderDisplayLabel } from "@/lib/orderDisplayNumber";
import { ADMIN_EMAIL, EMAIL_FROM, SITE_NAME } from "@/lib/constants";
import { buildCheckoutEmails } from "@/lib/checkoutEmailTemplate";
import { applyCheckoutCustomerEffects } from "@/lib/checkoutCustomerEffects";
import { sendNewOrderNotification } from "@/lib/fcmAdmin";
import { OrderStoreError, serverOrderStore } from "@/lib/serverOrderStore";

async function sendEmail({ order, idempotencyKey, admin }) {
  if (!process.env.RESEND_API_KEY) throw new OrderStoreError("EMAIL_NOT_CONFIGURED");
  const label = orderDisplayLabel(order);
  const reference = label.startsWith("#") ? label : `#${label}`;
  const html = buildCheckoutEmails({ paymentMethod: order.paymentMethod, formData: order.customer,
    orderNumber: orderDisplayLabel(order).replace(/^#/, ""), signedQuote: order.financials });
  const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: EMAIL_FROM, to: admin ? ADMIN_EMAIL : order.customer.email,
      subject: admin ? `طلب جديد من ${order.customer.firstName} ${reference}` : `تأكيد طلبك من ${SITE_NAME} — ${reference}`,
      html: admin ? html.adminHtml : html.customerHtml }),
  });
  if (!response.ok) throw new OrderStoreError("EMAIL_PROVIDER_REJECTED");
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id) throw new OrderStoreError("EMAIL_ACCEPTANCE_UNVERIFIABLE");
  return { providerId: result.id };
}
export function checkoutDeliveryHandlers({ store = serverOrderStore } = {}) {
  return {
    customer_counters: context => applyCheckoutCustomerEffects(context, { store }),
    admin_email: context => sendEmail({ ...context, admin: true }),
    customer_email: context => sendEmail({ ...context, admin: false }),
    admin_push: async ({ order }) => {
      await sendNewOrderNotification({ title: "طلب جديد من WIND", body: `${order.customer.firstName} • ${order.paymentMethod} • ${order.financials.total} EGP • ${orderDisplayLabel(order).startsWith("#") ? orderDisplayLabel(order) : `#${orderDisplayLabel(order)}`}`,
        orderId: order.orderId, strict: true });
      return {};
    },
  };
}
