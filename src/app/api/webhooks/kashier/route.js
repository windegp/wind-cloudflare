import { durablePaymentWebhook } from "@/lib/durablePaymentWebhook";
import { NextResponse } from 'next/server';
import { getCairoTimestamp } from '@/lib/analytics-helpers';
import { verifyWebhookSignature } from '@/lib/kashier';
import { verifyCheckoutQuote } from '@/lib/checkoutQuoteToken';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/apiResponse';
import { getDb } from "@/lib/firebase";
import { doc, setDoc, updateDoc, increment } from "firebase/firestore/lite";
import { serverOrderStore } from "@/lib/serverOrderStore";
import { sendNewOrderNotification } from '@/lib/fcmAdmin';

// Helper: Cairo-local ISO timestamp matching dashboard query format "YYYY-MM-DD HH:MM:SS"

// 🛡️ حماية الذاكرة المؤقتة (تمنع الهجمات المتكررة - DDoS & Replay Attacks)
const requestCounts = new Map();
const processedOrders = new Set();

export async function POST(request) {
    // Durable mode is opt-in. Once activated, keep this routing enabled while any
    // durable card order is outstanding, even if accepting new orders is paused.
    if (process.env.CHECKOUT_DURABLE_WEBHOOK_ENABLED === "true") {
      try {
        const result = await durablePaymentWebhook(await request.clone().json(), request.headers.get("x-kashier-signature"));
        if (result) return NextResponse.json({ code: result.code }, { status: result.status });
      } catch (_) {
        console.error(JSON.stringify({ event: "durable_webhook_failed", code: "PAYMENT_RECEIPT_UNRESOLVED" }));
        return NextResponse.json({ error: "PAYMENT_RECEIPT_UNRESOLVED" }, { status: 503 });
      }
    }
    // 🛡️ 1. الجدار الناري البسيط (Rate Limiting) - بحد أقصى 15 طلب في الدقيقة لكل IP
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    
    if (requestCounts.has(ip)) {
        const { count, startTime } = requestCounts.get(ip);
        if (now - startTime < 60000) { // خلال دقيقة
            if (count > 15) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
            requestCounts.set(ip, { count: count + 1, startTime });
        } else {
            requestCounts.set(ip, { count: 1, startTime: now });
        }
    } else {
        requestCounts.set(ip, { count: 1, startTime: now });
    }

    let failedOrderId = null;
    try {
        const body = await request.json();
        const { data, event } = body;
        const kashierSignature = request.headers.get('x-kashier-signature');
        const orderId = data?.merchantOrderId;
        failedOrderId = orderId || null;

        // 🛡️ 2. منع الهجوم المكرر (Replay Attack) لنفس الأوردر في نفس اللحظة
        if (orderId && processedOrders.has(orderId)) {
            return NextResponse.json({ success: true, message: "Order is already being processed" }, { status: 200 });
        }

        // التحقق من صحة التوقيع
        const isValid = await verifyWebhookSignature(data, kashierSignature);

        if (!isValid) {
            console.error(JSON.stringify({ event: "kashier_webhook_rejected", reason: "INVALID_SIGNATURE", orderId: orderId || null, kashierEvent: event || null, status: data?.status || null }));
            const response = unauthorizedError('Invalid webhook signature');
            return NextResponse.json(response.body, { status: response.status });
        }

        // 🛡️ إضافة الأوردر لقائمة "قيد التنفيذ" لمدة 5 دقائق لمنع التكرار
        if (orderId) {
            processedOrders.add(orderId);
            setTimeout(() => processedOrders.delete(orderId), 300000); 
        }

        if (!(event === 'pay' && data.status === 'SUCCESS')) {
            // Not a successful payment event: acknowledged without changes. Logged so it is visible.
            console.log(JSON.stringify({ event: "kashier_webhook_ignored", reason: "NOT_SUCCESSFUL_PAY_EVENT", orderId: orderId || null, kashierEvent: event || null, status: data?.status || null }));
        }

        // 🔥 معالجة نجاح الدفع
        if (event === 'pay' && data.status === 'SUCCESS') {
            console.log(`Payment Successful for Order: ${orderId}`);
            
            const db = getDb();
            const orderRef = doc(db, "Orders", orderId);
            // Read via the service account, not the public client SDK. Same document,
            // same fields; an unreadable/absent id is treated as "no order doc".
            const orderData = await serverOrderStore.getData("Orders", orderId);

            if (orderData) {

                // Kashier signature validity alone is not enough: the paid amount
                // and currency must also match the server-quoted order snapshot.
                const expectedAmount = Number(orderData.Total);
                const receivedAmount = Number(data.amount);
                const expectedCurrency = String(orderData.Currency || "EGP").toUpperCase();
                const receivedCurrency = String(data.currency || "EGP").toUpperCase();

                // New checkout records carry a signed quote token. Verify it here
                // so a client-edited Firestore Total cannot become the payment source.
                let signedQuote = null;
                if (orderData["Checkout Quote Token"]) {
                    try {
                        signedQuote = await verifyCheckoutQuote(
                            orderData["Checkout Quote Token"],
                            orderId
                        );
                    } catch (quoteError) {
                        console.error("[Kashier webhook] Checkout quote verification failed:", quoteError);
                    }
                }

                if (
                    (orderData["Checkout Quote Token"] && !signedQuote) ||
                    !Number.isFinite(expectedAmount) ||
                    !Number.isFinite(receivedAmount) ||
                    Math.abs(expectedAmount - receivedAmount) > 0.01 ||
                    receivedCurrency !== expectedCurrency ||
                    (signedQuote && Math.abs(Number(signedQuote.total) - expectedAmount) > 0.01)
                ) {
                    if (orderId) processedOrders.delete(orderId);
                    console.error("[Kashier webhook] Payment amount/currency mismatch; order remains unpaid.", {
                        orderId,
                        expectedAmount,
                        receivedAmount,
                        expectedCurrency,
                        receivedCurrency,
                    });
                    return NextResponse.json(
                        { success: true, ignored: true, reason: "PAYMENT_AMOUNT_MISMATCH" },
                        { status: 200 }
                    );
                }

                if (orderData['Financial Status'] !== 'paid') {
                    
                    // 1. تحديث حالة الطلب
                    await setDoc(orderRef, {
                        "Financial Status": "paid",
                        "Payment Method": "card",
                        "Payment Reference": data.transactionId || ""
                    }, { merge: true });

                    // 🔥 1.5 إشعار صوتي للأدمن — نفس نقطة الإشعار المستخدمة في
                    // create-order/route.js لـ COD/InstaPay. هنا كانت الفيزا
                    // قبل كده من غير أي إشعار خالص (إيميل ولا صوت).
                    const billingName = (orderData['Billing Name'] || '').split(' ');
                    // A failed push must not stop the customer/counter updates below.
                    try {
                        await sendNewOrderNotification({
                            title: `طلب جديد من WIND`,
                            body: `${billingName[0] || 'عميل'} • فيزا • ${orderData.Total || 0} ${orderData.Currency || 'EGP'} • #${orderId}`,
                            orderId,
                        });
                    } catch (notifyError) {
                        console.error("[Kashier webhook] Admin notification failed:", notifyError);
                    }

                    // 2. تحديث ملف العميل (يدعم العملاء الجدد وقدامى)
                    const cleanPhone = orderData.Phone?.replace(/[^0-9]/g, '') || "";
                    const customerId = orderData.Email ? orderData.Email.toLowerCase().trim() : cleanPhone;

                    if (customerId) {
                        const customerRef = doc(db, "Customers", customerId);
                        // Service-account read (public read is being closed); writes below stay as-is.
                        const existingData = await serverOrderStore.getData("Customers", customerId);

                        if (existingData) {
                            // عميل موجود — نحدّث بياناته
                            const currentOrders = Number(existingData['Total Orders'] || 0);
                            const currentSpent = Number(existingData['Total Spent'] || 0);
                            const newSegment = currentOrders >= 1 ? "VIP_Customer" : "Purchased_Once";

                            // ⚠️ If customer had 0 orders (abandoned cart only), this is their
                            // FIRST purchase → must increment counters.customers
                            if (currentOrders === 0) {
                                const settingsRef = doc(db, "settings", "siteSettings");
                                await updateDoc(settingsRef, {
                                    "counters.customers": increment(1)
                                });
                            }

                            await setDoc(customerRef, {
                                "Total Orders": currentOrders + 1,
                                "Total Spent": currentSpent + Number(orderData.Total || 0),
                                Last_Order_Status: "Paid",
                                hasAbandoned: false,
                                segments: [newSegment],
                                last_active: getCairoTimestamp()
                            }, { merge: true });
                        } else {
                            // عميل جديد تماماً (دفع بالفيزا أول مرة)
                            // نستخدم بيانات من الأوردر لإنشاء ملف العميل
                            const billingName = (orderData['Billing Name'] || '').split(' ');
                            const firstName = billingName[0] || '';
                            const lastName = billingName.slice(1).join(' ') || '';

                            await setDoc(customerRef, {
                                "First Name": firstName,
                                "Last Name": lastName,
                                Email: orderData.Email || '',
                                Phone: orderData.Phone || '',
                                "Default Address Address1": orderData['Shipping Address1'] || '',
                                "Default Address City": orderData['Shipping City'] || '',
                                "Default Address Province": orderData['Shipping Province'] || '',
                                "Total Orders": 1,
                                "Total Spent": Number(orderData.Total || 0),
                                Last_Order_Status: "Paid",
                                data_source: "WIND_Web",
                                segments: ["Purchased_Once"],
                                last_active: getCairoTimestamp()
                            }, { merge: true });

                            // زيادة عداد العملاء فقط للعميل الجديد
                            try {
                                const settingsRef = doc(db, "settings", "siteSettings");
                                await updateDoc(settingsRef, {
                                    "counters.customers": increment(1)
                                });
                                console.log(`Customers counter incremented for new card customer: ${customerId}`);
                            } catch (counterError) {
                                console.error("Failed to increment customers counter:", counterError);
                            }
                        }
                    }

                    // 3. تحديث العدادات العامة
                    try {
                        const settingsRef = doc(db, "settings", "siteSettings");
                        await updateDoc(settingsRef, {
                            "counters.orders": increment(1),
                            "counters.sales": increment(Number(orderData.Total || 0))
                        });
                        console.log(`Global counters updated successfully for Order: ${orderId}`);
                    } catch (counterError) {
                        console.error("Failed to update global counters:", counterError);
                    }
                } else {
                    console.log(`Order ${orderId} is already marked as paid. Skipping counters.`);
                }
            } else {
                // Signature was valid but no order doc has this merchantOrderId.
                if (orderId) processedOrders.delete(orderId);
                console.error(JSON.stringify({ event: "kashier_webhook_ignored", reason: "ORDER_NOT_FOUND", orderId: orderId || null }));
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
        
    } catch (error) {
        // Allow Kashier's retry to be processed instead of being dropped as "already processing".
        if (failedOrderId) processedOrders.delete(failedOrderId);
        console.error("Webhook Error:", error);
        const response = errorResponse('Webhook processing failed', 'WEBHOOK_ERROR', 500);
        return NextResponse.json(response.body, { status: response.status });
    }
}