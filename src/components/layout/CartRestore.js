"use client";

import { useEffect } from "react";
import { parseCartRestoreParam } from "@/lib/abandonedCartMessage";

// يقرأ ?cart= من لينك استرجاع السلة (رسالة واتساب)، يدمج المنتجات في wind_cart،
// ثم يعيد تحميل الصفحة برابط نظيف عشان CartContext يقرأ النسخة الجديدة مرة واحدة.
export default function CartRestore() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("cart");
    if (!raw) return;

    const incoming = parseCartRestoreParam(raw);

    if (incoming.length) {
      try {
        const existing = JSON.parse(localStorage.getItem("wind_cart") || "[]");
        const merged = Array.isArray(existing) ? [...existing] : [];
        for (const item of incoming) {
          const found = merged.find(
            (m) =>
              m.id === item.id &&
              String(m.selectedSize || "") === item.selectedSize &&
              String(m.selectedColor || "") === item.selectedColor
          );
          if (found) {
            found.qty = (Number(found.qty) || 1) + item.qty;
          } else {
            merged.push(item);
          }
        }
        localStorage.setItem("wind_cart", JSON.stringify(merged.slice(0, 50)));
      } catch {
        // مساحة التخزين ممتلئة أو تالفة: نتجاهل ونكمل بتنظيف الرابط.
      }
    }

    params.delete("cart");
    const clean =
      window.location.pathname +
      (params.toString() ? `?${params.toString()}` : "") +
      window.location.hash;

    if (incoming.length) {
      window.location.replace(clean);
    } else {
      window.history.replaceState(null, "", clean);
    }
  }, []);

  return null;
}
