/**
 * 🧪 WIND DIAGNOSTIC PROBE — تعديل مؤقت بالكامل، ليس جزءاً من المنطق الدائم للمشروع.
 *
 * الهدف الوحيد: مسك أول Runtime Exception حقيقي أثناء تحميل الصفحة الرئيسية على
 * المتصفحات القديمة، من غير أي تغيير في أي منطق أو سلوك أو Error Boundaries.
 *
 * - لا يعترض console.error ولا أي Console API — بس window.onerror و
 *   window.onunhandledrejection.
 * - لا يعرض أي شيء على الشاشة أثناء التشغيل الطبيعي — العرض بيحصل فقط لو
 *   استثناء حقيقي حصل فعلاً.
 * - كل البيانات محفوظة في window.__WIND_DIAG__.
 * - مكتوب بصيغة ES5 خام عمداً (بدون ?. أو ?? أو Classes) عشان السكريبت نفسه
 *   يشتغل حتى على المتصفح القديم اللي بنحقق فيه، ولإنه لازم يتحمّل كـ <script>
 *   عادي في <head> قبل أي حاجة تانية (حتى قبل الـ bundle الرئيسي)، عشان يمسك
 *   أي استثناء يحصل من أول لحظة تنفيذ فعلي (زي lib/polyfills.js مثلاً).
 *
 * الحذف بعد انتهاء التحقيق: امسح هذا الملف + سطر <script src="/wind-diag-probe.js">
 * من layout.js + كل استدعاءات window.__WIND_DIAG__.mark(...) المضافة في باقي
 * الملفات. لا يوجد أي تعديل آخر مطلوب.
 */
(function () {
  "use strict";

  if (window.__WIND_DIAG__) return; // منع التهيئة المزدوجة

  var marks = [];
  var errorCaptured = false;

  function mark(name) {
    marks.push({ name: name, t: new Date().getTime() });
  }

  function lastMarkName() {
    return marks.length > 0 ? marks[marks.length - 1].name : "(لا يوجد Mark وصل قبل العطل)";
  }

  function getBrowserVersionInfo(ua) {
    var chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    var isWebView = /; wv\)/.test(ua);
    var androidMatch = ua.match(/Android\s([\d.]+)/);
    return {
      chromeVersion: chromeMatch ? chromeMatch[1] : "(غير معروف)",
      isLikelyWebView: isWebView,
      androidVersion: androidMatch ? androidMatch[1] : "(غير معروف)"
    };
  }

  function renderOverlay(diag) {
    try {
      var box = document.createElement("div");
      box.setAttribute(
        "style",
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
        "background:#1a1a1a;color:#0f0;font-family:monospace;font-size:12px;" +
        "padding:12px;max-height:70vh;overflow:auto;direction:ltr;text-align:left;" +
        "white-space:pre-wrap;word-break:break-all;border-bottom:3px solid red;"
      );
      var lines = [
        "=== WIND DIAGNOSTIC PROBE — Exception Captured ===",
        "Message: " + diag.message,
        "File: " + diag.file,
        "Line: " + diag.line + "  Column: " + diag.column,
        "Last successful mark: " + diag.lastMark,
        "Timestamp: " + diag.timestamp,
        "userAgent: " + diag.userAgent,
        "Chrome version: " + diag.browserVersion.chromeVersion,
        "Likely WebView: " + diag.browserVersion.isLikelyWebView,
        "Android version: " + diag.browserVersion.androidVersion,
        "",
        "All marks reached before the error:",
        diag.allMarksText,
        "",
        "Stack:",
        diag.stack || "(غير متاح)"
      ];
      box.textContent = lines.join("\n");
      if (document.body) {
        document.body.appendChild(box);
      } else {
        document.documentElement.appendChild(box);
      }
    } catch (renderErr) {
      // لو حتى العرض نفسه فشل، البيانات لسه محفوظة في window.__WIND_DIAG__
    }
  }

  function captureException(info) {
    if (errorCaptured) return; // بس أول استثناء
    errorCaptured = true;

    var ua = navigator.userAgent || "(غير متاح)";
    var diag = {
      message: info.message || "(بدون رسالة)",
      stack: info.stack || null,
      file: info.filename || "(غير معروف)",
      line: info.lineno != null ? info.lineno : "(غير معروف)",
      column: info.colno != null ? info.colno : "(غير معروف)",
      lastMark: lastMarkName(),
      allMarksText: marks.length > 0
        ? marks.map(function (m) { return "  - " + m.name + " (t=" + m.t + ")"; }).join("\n")
        : "  (لا توجد أي marks اتسجلت قبل العطل)",
      timestamp: new Date().toISOString(),
      userAgent: ua,
      browserVersion: getBrowserVersionInfo(ua)
    };

    window.__WIND_DIAG__.capturedError = diag;
    renderOverlay(diag);
  }

  window.__WIND_DIAG__ = {
    marks: marks,
    mark: mark,
    capturedError: null
  };

  window.onerror = function (message, source, lineno, colno, error) {
    captureException({
      message: message,
      stack: error && error.stack,
      filename: source,
      lineno: lineno,
      colno: colno
    });
    return false;
  };

  window.onunhandledrejection = function (event) {
    var reason = event && event.reason;
    captureException({
      message: (reason && reason.message) || String(reason),
      stack: reason && reason.stack,
      filename: null,
      lineno: null,
      colno: null
    });
  };

  mark("Diagnostic probe installed");
})();
