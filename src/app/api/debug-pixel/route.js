// TEMPORARY DIAGNOSTIC ENDPOINT — DELETE AFTER ROOT CAUSE FOUND
// Access: GET /api/debug-pixel
// Shows environment status + sends a real test event to Meta

export const dynamic = "force-dynamic";

const PIXEL_ID = "880930164288645";

export async function GET(request) {
  const tokenRaw = process.env.FB_CONVERSIONS_TOKEN;
  const testCode  = process.env.FB_TEST_EVENT_CODE;

  // ── 1. Environment variables ──────────────────────────────────────────
  const envStatus = {
    FB_CONVERSIONS_TOKEN: tokenRaw
      ? `✅ SET (starts with: ${tokenRaw.slice(0, 8)}... length: ${tokenRaw.length})`
      : "❌ MISSING",
    FB_TEST_EVENT_CODE: testCode
      ? `✅ SET (value: ${testCode})`
      : "❌ MISSING — events go to Production, NOT visible in Test Events",
    PIXEL_ID,
  };

  if (!tokenRaw) {
    return Response.json({
      status: "FATAL",
      message: "FB_CONVERSIONS_TOKEN is not set in this environment",
      env: envStatus,
    }, { status: 500 });
  }

  // ── 2. Send a real ViewContent test event to Meta ────────────────────
  const now = Math.floor(Date.now() / 1000);
  const testEventId = `DiagViewContent-${Date.now()}`;

  const payload = {
    data: [{
      event_name:        "ViewContent",
      event_id:          testEventId,
      event_time:        now,
      action_source:     "website",
      event_source_url:  "https://windeg.com/products/diagnostic-test",
      user_data: {
        client_ip_address: request.headers.get("cf-connecting-ip") || "1.2.3.4",
        client_user_agent: request.headers.get("user-agent") || "diagnostic",
      },
      custom_data: {
        currency:    "EGP",
        value:       99,
        content_ids: ["diagnostic-handle"],
        content_type:"product",
        content_name:"Diagnostic Test Product",
      },
    }],
  };

  if (testCode) {
    payload.test_event_code = testCode;
  }

  let metaStatus = null;
  let metaBody   = null;
  let metaError  = null;
  let graphUrl   = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

  try {
    const metaRes = await fetch(
      `${graphUrl}?access_token=${tokenRaw}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      }
    );
    metaStatus = metaRes.status;
    metaBody   = await metaRes.json();
  } catch (err) {
    metaError = err.message;
  }

  // ── 3. Return full diagnostic report ────────────────────────────────
  return Response.json({
    timestamp:      new Date().toISOString(),
    environment:    envStatus,
    test_event_sent: {
      event_id:    testEventId,
      graph_url:   graphUrl,
      test_code_included: !!testCode,
      payload_summary: {
        event_name:    "ViewContent",
        content_ids:   ["diagnostic-handle"],
        value:         99,
        currency:      "EGP",
      },
    },
    meta_response: {
      http_status: metaStatus,
      body:        metaBody,
      error:       metaError,
      verdict: metaStatus === 200
        ? "✅ Meta accepted the event"
        : metaStatus === 400
        ? "❌ Meta rejected — bad payload or token"
        : metaStatus === 401
        ? "❌ Meta rejected — token invalid or expired"
        : metaStatus === 403
        ? "❌ Meta rejected — token lacks permissions"
        : `❌ Unexpected status: ${metaStatus}`,
    },
    instructions: testCode
      ? `Go to Meta Test Events and look for event_id: ${testEventId}`
      : "⚠️ FB_TEST_EVENT_CODE is not set — this event went to Production, not Test Events",
  });
}
