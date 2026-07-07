// app/api/fb-track/route.js
//
// نصف Server-side لأي حدث Meta Pixel — الطرف الآخر لـ Dual Fire (انظر
// lib/fbTrack.js). يُستدعى بنفس event_id الذي يُرسله المتصفح لنفس الحدث،
// فتدمج Meta النسختين معاً بدل احتسابهما كحدثين منفصلين.
//
// Zaraz أُزيل نهائياً من المشروع (Phase 1) — لا يوجد أي Workaround خاص به هنا.

import { normalizePhoneForMetaHash } from "@/lib/metaEventData";

const PIXEL_ID = "880930164288645";

async function sha256(text) {
  if (!text) return undefined;
  const normalized = String(text).trim().toLowerCase();
  if (!normalized) return undefined;
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// قراءة قيمة كوكي معينة من الـ Cookie header الخام
function readCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      event_name,
      event_id,           // لازم يكون فريد لكل حدث (لمنع التكرار/dedup)
      value,
      currency = "EGP",
      content_ids = [],
      content_name,
      content_type = "product",
      num_items,
      order_id,
      event_source_url,
      external_id,        // معرّف ثابت للزائر (من localStorage)، يحسّن EMQ
      fbp: fbpFromClient,
      fbc: fbcFromClient,
      // بيانات العميل (اختيارية، تُستخدم فقط في Purchase حالياً)
      email,
      phone,
      first_name,
      last_name,
      city,
      state,
      country,
      zip,
    } = body;

    if (!event_name) {
      return Response.json({ error: "event_name مطلوب" }, { status: 400 });
    }

    const cookieHeader = request.headers.get("cookie") || "";
    // 🔥 نعطي الأولوية لقيم fbp/fbc القادمة من العميل مباشرة (أحدث وأدق)
    // لأن قراءتها من الكوكي على السيرفر قد تكون متأخرة عن لحظة الحدث الفعلية
    const fbp = fbpFromClient || readCookie(cookieHeader, "_fbp");
    const fbc = fbcFromClient || readCookie(cookieHeader, "_fbc");

    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const [
      hashedEmail,
      hashedPhone,
      hashedFirstName,
      hashedLastName,
      hashedCity,
      hashedState,
      hashedCountry,
      hashedZip,
      hashedExternalId,
    ] =
      await Promise.all([
        sha256(email),
        sha256(normalizePhoneForMetaHash(phone)),
        sha256(first_name),
        sha256(last_name),
        sha256(city),
        sha256(state),
        sha256(country),
        sha256(zip),
        sha256(external_id),
      ]);

    const userData = {};
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (clientIp) userData.client_ip_address = clientIp;
    if (userAgent) userData.client_user_agent = userAgent;
    if (hashedEmail) userData.em = hashedEmail;
    if (hashedPhone) userData.ph = hashedPhone;
    if (hashedFirstName) userData.fn = hashedFirstName;
    if (hashedLastName) userData.ln = hashedLastName;
    if (hashedCity) userData.ct = hashedCity;
    if (hashedState) userData.st = hashedState;
    if (hashedCountry) userData.country = hashedCountry;
    if (hashedZip) userData.zp = hashedZip;
    if (hashedExternalId) userData.external_id = hashedExternalId;

    // 🔥 content_ids كـ array حقيقي 100% — هذا هو كل الهدف من هذا الـ route
    const customData = {
      currency,
    };
    if (value !== undefined) customData.value = Number(value);
    if (Array.isArray(content_ids) && content_ids.length > 0) {
      customData.content_ids = content_ids.map(String);
    }
    if (content_name) customData.content_name = content_name;
    if (content_type) customData.content_type = content_type;
    if (num_items !== undefined) customData.num_items = Number(num_items);
    if (order_id) customData.order_id = String(order_id);

    const eventPayload = {
      data: [
        {
          event_name,
          event_id: event_id || `${event_name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_source_url: event_source_url || "https://windeg.com",
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    // 🔥 test_event_code لا يعتمد على أي Environment Variable إطلاقاً بعد
    // الآن — لا يوجد أي قيمة مخزَّنة في البيئة يمكن أن تُفعِّل وضع الاختبار
    // بالخطأ في Production. الطريقة الوحيدة لتفعيله: أن يرسل المطوّر الكود
    // الفعلي بشكل صريح ومتعمَّد ضمن جسم الطلب نفسه (نسخه يدوياً من جلسة
    // Test Events الحيّة في Events Manager وقت الاختبار فقط). أي كود إنتاجي
    // في المتجر لا يرسل هذا الحقل إطلاقاً، فيستحيل بنيوياً وصول أي حدث
    // Production مُصنَّف كـ Test Event لدى Meta.
    const debugTestEventCode =
      typeof body?.debug_test_event_code === "string" && body.debug_test_event_code.trim()
        ? body.debug_test_event_code.trim()
        : undefined;
    if (debugTestEventCode) {
      eventPayload.test_event_code = debugTestEventCode;
    }

    const accessToken = process.env.FB_CONVERSIONS_TOKEN;
    if (!accessToken) {
      console.error("[fb-track] FATAL: FB_CONVERSIONS_TOKEN is missing from environment variables");
      return Response.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const graphUrl = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${accessToken}`;

    // 🔥 محاولة واحدة إضافية فقط عند فشل شبكي أو خطأ 5xx من Meta (أمر خارج
    // سيطرتنا، وغالباً مؤقت). لا إعادة محاولة عند 4xx — هذا رفض حقيقي
    // (بيانات ناقصة/توكن غير صالح/...)، وإعادة الإرسال لن تصلحه، بل قد
    // تُنتج حدثاً مكرراً بلا داعٍ.
    async function postToGraphWithRetry(attempt = 1) {
      let res;
      try {
        res = await fetch(graphUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventPayload),
        });
      } catch (networkErr) {
        if (attempt < 2) return postToGraphWithRetry(attempt + 1);
        throw networkErr;
      }
      if (!res.ok && res.status >= 500 && attempt < 2) {
        return postToGraphWithRetry(attempt + 1);
      }
      return res;
    }

    const fbRes = await postToGraphWithRetry();
    const fbData = await fbRes.json();

    console.log(
      "[fb-track]",
      event_name,
      debugTestEventCode ? "(test mode)" : "(production)",
      "→",
      fbRes.status,
      fbData?.events_received !== undefined ? `events_received=${fbData.events_received}` : ""
    );

    if (!fbRes.ok) {
      console.error("[fb-track] ✗ Meta rejected event:", event_name, JSON.stringify(fbData));
      return Response.json(
        { success: false, fbResponse: fbData, status: fbRes.status },
        { status: fbRes.status }
      );
    }

    return Response.json({ success: true, fbResponse: fbData });
  } catch (error) {
    console.error("fb-track route error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
