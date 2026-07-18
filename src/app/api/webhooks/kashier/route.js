import { NextResponse } from 'next/server';
import { getCairoTimestamp } from '@/lib/analytics-helpers';
import { verifyWebhookSignature } from '@/lib/kashier';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/apiResponse';
import { getDb } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore/lite";
import { sendNewOrderNotification } from '@/lib/fcmAdmin';

// Helper: Cairo-local ISO timestamp matching dashboard query format "YYYY-MM-DD HH:MM:SS"

// 🛡️ حماية الذاكرة المؤقتة (تمنع الهجمات المتكررة - DDoS & Replay Attacks)
const requestCounts = new Map();
const processedOrders = new Set();

export async function POST(request) {
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

    try {
        const body = await request.json();
        const { data, event } = body;
        const kashierSignature = request.headers.get('x-kashier-signature');
        const orderId = data?.merchantOrderId;

        // 🛡️ 2. منع الهجوم المكرر (Replay Attack) لنفس الأوردر في نفس اللحظة
        if (orderId && processedOrders.has(orderId)) {
            return NextResponse.json({ success: true, message: "Order is already being processed" }, { status: 200 });
        }

        // التحقق من صحة التوقيع
        const isValid = verifyWebhookSignature(data, kashierSignature);

        if (!isValid) {
            console.error("Invalid Webhook Signature!");
            const response = unauthorizedError('Invalid webhook signature');
            return NextResponse.json(response.body, { status: response.status });
        }

        // 🛡️ إضافة الأوردر لقائمة "قيد التنفيذ" لمدة 5 دقائق لمنع التكرار
        if (orderId) {
            processedOrders.add(orderId);
            setTimeout(() => processedOrders.delete(orderId), 300000); 
        }

        // 🔥 معالجة نجاح الدفع
        if (event === 'pay' && data.status === 'SUCCESS') {
            console.log(`Payment Successful for Order: ${orderId}`);
            
            const db = getDb();
            const orderRef = doc(db, "Orders", orderId);
            const orderSnap = await getDoc(orderRef);

            if (orderSnap.exists()) {
                const orderData = orderSnap.data();

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
                    await sendNewOrderNotification({
                        title: `طلب جديد من WIND`,
                        body: `${billingName[0] || 'عميل'} • فيزا • ${orderData.Total || 0} ${orderData.Currency || 'EGP'} • #${orderId}`,
                        orderId,
                    });

                    // 2. تحديث ملف العميل (يدعم العملاء الجدد وقدامى)
                    const cleanPhone = orderData.Phone?.replace(/[^0-9]/g, '') || "";
                    const customerId = orderData.Email ? orderData.Email.toLowerCase().trim() : cleanPhone;

                    if (customerId) {
                        const customerRef = doc(db, "Customers", customerId);
                        const customerSnap = await getDoc(customerRef);

                        if (customerSnap.exists()) {
                            // عميل موجود — نحدّث بياناته
                            const existingData = customerSnap.data();
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
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
        
    } catch (error) {
        console.error("Webhook Error:", error);
        const response = errorResponse('Webhook processing failed', 'WEBHOOK_ERROR', 500);
        return NextResponse.json(response.body, { status: response.status });
    }
}