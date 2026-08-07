// app/api/tt-track/route.js
//
// النصف الخادومي لـ TikTok Events API — الطرف الآخر لـ Dual Fire (انظر
// lib/ttTrack.js). مستقل تمامًا عن /api/fb-track/route.js — لا استيراد،
// لا event_id مشترك، لا دوال مشتركة مع منظومة Meta.
//
// TikTok Pixel: "TikTok Pixel 07/2026" — D4K5SMBC77U6QK8E5OMG
// ⚠️ الشكل الدقيق لجسم الطلب (context/properties) مبني على توثيق TikTok
// Business Events API v1.3 العام وقت الكتابة — يُنصَح بتأكيده عبر Test
// Events tool في TikTok Events Manager قبل الاعتماد الكامل في الإنتاج.

const PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "D4K5SMBC77U6QK8E5OMG";

// 🔥 دالة SHA-256 مستقلة تمامًا — مكرَّرة عمدًا (~6 أسطر) بدل استيرادها من
// fb-track/route.js، لضمان صفر ترابط فعلي بين الملفين.
async function ttSha256(text) {
  if (!text) return undefined;
  const normalized = String(text).trim().toLowerCase();
  if (!normalized) return undefined;
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 🔥 تطبيع رقم هاتف مصري لصيغة E.164 (بدون +) — منطق مستقل عن
// normalizePhoneForMetaHash في lib/metaEventData.js (نفس الحاجة العملية،
// كود مكتوب من الصفر هنا وليس مستوردًا).
function normalizePhoneForTt(phone) {
  if (!phone) return undefined;
  const digits = String(phone).replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  if (/^01[0125][0-9]{8}$/.test(digits)) return `2${digits}`;
  if (/^201[0125][0-9]{8}$/.test(digits)) return digits;
  return digits;
}

async function postToTikTokEventsAPI(body) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    return { ok: false, skipped: true, reason: "TIKTOK_ACCESS_TOKEN not configured" };
  }
  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": accessToken,
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
}

export async function POST(request) {
  try {
    const data = await request.json();

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const [hashedEmail, hashedPhone, hashedExternalId] = await Promise.all([
      ttSha256(data.email),
      ttSha256(normalizePhoneForTt(data.phone)),
      ttSha256(data.external_id),
    ]);

        const ttBody = {
  event_source: "web",
  event_source_id: PIXEL_ID,
  ...(process.env.TIKTOK_TEST_EVENT_CODE
    ? { test_event_code: process.env.TIKTOK_TEST_EVENT_CODE }
    : {}),
  data: [
    {
      event: data.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: data.event_id,

      user: {
        ...(hashedEmail ? { email: [hashedEmail] } : {}),
        ...(hashedPhone ? { phone: [hashedPhone] } : {}),
        ...(hashedExternalId ? { external_id: [hashedExternalId] } : {}),
        ...(data.ttp ? { ttp: data.ttp } : {}),
        ...(data.ttclid ? { ttclid: data.ttclid } : {}),
        ...(ip ? { ip } : {}),
        ...(userAgent ? { user_agent: userAgent } : {}),
      },

      page: {
        ...(data.page_url ? { url: data.page_url } : {}),
        ...(data.referrer ? { referrer: data.referrer } : {}),
      },

      properties: {
        ...(data.contents?.length ? { contents: data.contents } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(typeof data.value === "number" ? { value: data.value } : {}),
        ...(data.order_id ? { order_id: data.order_id } : {}),
      },
    },
  ],
};

    const result = await postToTikTokEventsAPI(ttBody);

return new Response(JSON.stringify(result), {
  status: result.ok ? 200 : 502,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
});
    } catch (err) {
    console.error("[TikTok Events API] Request failed:", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: err.message || "TikTok Events API request failed",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
