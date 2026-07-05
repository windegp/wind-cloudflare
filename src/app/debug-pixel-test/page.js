"use client";
// TEMPORARY DIAGNOSTIC PAGE — DELETE AFTER ROOT CAUSE FOUND
// Access: https://windeg.com/debug-pixel-test

import { useState } from "react";

export default function DebugPixelTest() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const log = (msg, type = "info") => {
    const time = new Date().toISOString().split("T")[1].slice(0, 12);
    setResults((prev) => [...prev, { time, msg, type }]);
    // eslint-disable-next-line no-console
    if (typeof window !== "undefined" && window.__originalConsoleLog) {
      window.__originalConsoleLog(`[debug-pixel-test] ${msg}`);
    }
  };

  const runTest = async (eventName) => {
    setLoading(true);
    log(`▶ Testing ${eventName}...`, "info");

    const payload = {
      event_name: eventName,
      event_source_url: window.location.href,
      value: 99,
      currency: "EGP",
      content_ids: ["diagnostic-handle"],
      content_type: "product",
      content_name: "Diagnostic Test",
      num_items: 1,
    };

    log(`  Payload: ${JSON.stringify(payload)}`, "info");

    try {
      // This is the EXACT same fetch call as fbTrack() in production
      const res = await fetch("/api/fb-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      const text = await res.text();
      log(`  HTTP Status: ${res.status}`, res.ok ? "success" : "error");
      log(`  Response: ${text}`, res.ok ? "success" : "error");

      if (res.ok) {
        const data = JSON.parse(text);
        if (data.fbResponse?.events_received === 1) {
          log(`  ✅ Meta ACCEPTED the event! Look for event in Test Events.`, "success");
        } else {
          log(`  ⚠️ Route responded OK but Meta said: ${JSON.stringify(data.fbResponse)}`, "warn");
        }
      } else {
        log(`  ❌ Route returned error: ${text}`, "error");
      }
    } catch (err) {
      log(`  ❌ fetch() FAILED: ${err.message}`, "error");
      log(`  This means the request never left the browser!`, "error");
      log(`  Likely cause: CSP header, Zaraz interception, or network error`, "error");
    }

    setLoading(false);
  };

  const runServerTest = async () => {
    setLoading(true);
    log("▶ Running server-side diagnostic (GET /api/debug-pixel)...", "info");
    try {
      const res = await fetch("/api/debug-pixel");
      const data = await res.json();
      log(`  Server result: ${JSON.stringify(data.meta_response)}`, data.meta_response?.http_status === 200 ? "success" : "error");
      log(`  Environment: ${JSON.stringify(data.environment)}`, "info");
    } catch (err) {
      log(`  ❌ ${err.message}`, "error");
    }
    setLoading(false);
  };

  const colorMap = {
    info: "#333",
    success: "#166534",
    error: "#991b1b",
    warn: "#92400e",
  };
  const bgMap = {
    info: "#f9fafb",
    success: "#f0fdf4",
    error: "#fef2f2",
    warn: "#fffbeb",
  };

  return (
    <div style={{ fontFamily: "monospace", padding: "24px", maxWidth: "800px", margin: "0 auto", direction: "ltr" }}>
      <h1 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "8px" }}>
        🔍 fbTrack Browser Diagnostic
      </h1>
      <p style={{ color: "#666", fontSize: "13px", marginBottom: "24px" }}>
        Tests the exact path that fbTrack() takes from browser → /api/fb-track → Meta CAPI.
        Open DevTools Network tab (filter: fb-track) before clicking.
      </p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
        {["ViewContent", "AddToCart", "InitiateCheckout", "Purchase"].map((ev) => (
          <button
            key={ev}
            onClick={() => runTest(ev)}
            disabled={loading}
            style={{
              padding: "10px 16px",
              background: "#1877f2",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontSize: "13px",
              fontFamily: "monospace",
            }}
          >
            Test {ev}
          </button>
        ))}
        <button
          onClick={runServerTest}
          disabled={loading}
          style={{
            padding: "10px 16px",
            background: "#166534",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            fontSize: "13px",
            fontFamily: "monospace",
          }}
        >
          Server Test
        </button>
        <button
          onClick={() => setResults([])}
          style={{
            padding: "10px 16px",
            background: "#6b7280",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Clear
        </button>
      </div>

      {results.length === 0 && (
        <p style={{ color: "#9ca3af", fontSize: "13px" }}>
          Click a button to run the test. Results appear here.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              padding: "8px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              color: colorMap[r.type],
              background: bgMap[r.type],
              borderLeft: `3px solid ${colorMap[r.type]}`,
            }}
          >
            <span style={{ color: "#9ca3af", marginRight: "8px" }}>{r.time}</span>
            {r.msg}
          </div>
        ))}
      </div>

      <div style={{ marginTop: "24px", padding: "12px", background: "#f3f4f6", borderRadius: "6px", fontSize: "12px", color: "#374151" }}>
        <strong>What to do after testing:</strong>
        <ol style={{ marginTop: "8px", paddingLeft: "16px", lineHeight: "1.8" }}>
          <li>Click "Test ViewContent" above</li>
          <li>Check DevTools Network tab — look for POST to /api/fb-track</li>
          <li>Go to Meta Events Manager → Test Events</li>
          <li>Look for a ViewContent event with source "windeg.com"</li>
          <li>Share the results from this page here</li>
        </ol>
      </div>
    </div>
  );
}
