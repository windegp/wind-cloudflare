import { NextResponse } from "next/server";
import { isSameOrigin, enforceRateLimit } from "@/lib/apiGuards";
import { EMAIL_FROM } from "@/lib/constants";
import { firestoreAdminSet } from "@/lib/firestoreAdmin";
import {
  buildContactEmail,
  buildSubscriptionEmail,
  validateContactForm,
  validateSubscription,
} from "@/lib/contactForm";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, private" };
// Fixed recipient: the form can never choose where the email goes.
const CONTACT_RECIPIENT = "windegp@gmail.com";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const limited = await enforceRateLimit(request, "CONTACT");
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "بيانات غير صحيحة." }, { status: 400, headers: HEADERS });
  }

  // Honeypot: real visitors never see or fill this field. Pretend success, send nothing.
  if (typeof body?.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true }, { headers: HEADERS });
  }

  const isSubscription = body?.type === "subscribe";
  const result = isSubscription ? validateSubscription(body) : validateContactForm(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400, headers: HEADERS });
  }

  const { subject, html } = isSubscription ? buildSubscriptionEmail(result.data) : buildContactEmail(result.data);

  const sendEmail = async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: CONTACT_RECIPIENT,
          reply_to: result.data.email,
          subject,
          html,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  // Subscribers are also saved (server-side, doc id = email, so repeats do not duplicate).
  const saveSubscriber = async () => {
    if (!isSubscription) return false;
    try {
      await firestoreAdminSet("Subscribers", result.data.email, {
        email: result.data.email,
        source: "footer",
        status: "active",
        subscribedAt: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  };

  const [emailed, saved] = await Promise.all([sendEmail(), saveSubscriber()]);
  // The owner is reachable through at least one path (email or saved list), so treat it as success.
  if (!emailed && !saved) {
    return NextResponse.json({ ok: false, error: "تعذر إرسال الرسالة الآن. حاول تاني أو كلمنا على واتساب." }, { status: 502, headers: HEADERS });
  }
  return NextResponse.json({ ok: true }, { headers: HEADERS });
}
