// app/api/fb-track/route.js
//
// نقطة موحّدة لإرسال كل أحداث Facebook Pixel (ViewContent, AddToCart,
// InitiateCheckout, Purchase) مباشرة لـ Conversions API من السيرفر،
// بدون المرور بـ Zaraz — لتجنب مشكلة flattening الخاصة بمعالجة
// الـ arrays (content_ids) داخل Zaraz Custom Actions.
//
// الكود في الصفحات يستدعي هذا الـ route بدل zaraz.track() لهذه الأحداث.
// PageView يبقى يعمل عبر Zaraz كما هو (لا مشكلة فيه أصلاً).

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
    console.log("[fb-track] ✓ Route hit — event_name:", body?.event_name, "| url:", body?.event_source_url);
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

    if (process.env.FB_TEST_EVENT_CODE) {
      eventPayload.test_event_code = process.env.FB_TEST_EVENT_CODE;
    }

    const accessToken = process.env.FB_CONVERSIONS_TOKEN;
    if (!accessToken) {
      console.error("[fb-track] FATAL: FB_CONVERSIONS_TOKEN is missing from environment variables");
      return Response.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // ── DIAGNOSTIC LOGGING (temporary — remove after root cause found) ──
    const graphUrl = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=***`;
    console.log("[fb-track] ▶ Sending event:", {
      event_name,
      pixel_id: PIXEL_ID,
      graph_url: graphUrl,
      test_event_code: process.env.FB_TEST_EVENT_CODE || "(NOT SET — events go to PRODUCTION)",
      has_token: !!accessToken,
      token_prefix: accessToken.slice(0, 8) + "...",
      payload_summary: {
        event_time: eventPayload.data[0].event_time,
        action_source: eventPayload.data[0].action_source,
        event_source_url: eventPayload.data[0].event_source_url,
        custom_data_keys: Object.keys(eventPayload.data[0].custom_data),
        user_data_keys: Object.keys(userData),
      },
    });

    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventPayload),
      }
    );

    const fbData = await fbRes.json();
    console.log("[fb-track] ◀ Meta response:", {
      http_status: fbRes.status,
      ok: fbRes.ok,
      response: fbData,
    });

    if (!fbRes.ok) {
      console.error("[fb-track] ✗ Meta rejected event:", JSON.stringify(fbData));
      return Response.json(
        { error: fbData.error?.message || "خطأ من فيسبوك", details: fbData },
        { status: 500 }
      );
    }

    return Response.json({ success: true, fbResponse: fbData });
  } catch (error) {
    console.error("fb-track route error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
