"use client";

import { useEffect } from "react";
import { parseCartRestoreParam } from "@/lib/abandonedCartMessage";

const RECOVERY_STORAGE_KEY = "wind_cart_recovery";

function cleanUrl(params) {
  return (
    window.location.pathname +
    (params.toString() ? `?${params.toString()}` : "") +
    window.location.hash
  );
}

// يقرأ لينك استرجاع السلة من رسالة واتساب:
// - ?cart-token= : لقطة محفوظة على السيرفر. يستبدل السلة بمنتجات اللقطة ويخزّن
//   علامة الاسترجاع، والشيك آوت بيكرّم أسعار وعروض اللقطة لو لسه في شباك الـ
//   ٧٢ ساعة (السيرفر هو اللي بيفصل في ده). استبدال مش دمج عشان العميل يلاقي
//   سلته زي ما سابها بالظبط، وأي تعديل بعدها بيمسح العلامة ويرجع السعر الحالي.
// - ?cart= : اللينك المضمّن القديم، بيدمج المنتجات في السلة زي ما هو.
// في الحالتين بنعيد التحميل برابط نظيف عشان CartContext يقرأ النسخة الجديدة.
export default function CartRestore() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const token = params.get("cart-token");
    if (token) {
      (async () => {
        let restored = false;
        try {
          const res = await fetch("/api/cart-recovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = await res.json();
          if (res.ok && data?.found && Array.isArray(data.items) && data.items.length) {
            localStorage.setItem("wind_cart", JSON.stringify(data.items.slice(0, 50)));
            if (Array.isArray(data.giftSelections) && data.giftSelections.length) {
              localStorage.setItem(
                "wind_customer_choice_gifts",
                JSON.stringify(data.giftSelections)
              );
            } else {
              localStorage.removeItem("wind_customer_choice_gifts");
            }
            if (data.honored && Date.parse(data.expiresAt || "") > Date.now()) {
              localStorage.setItem(
                RECOVERY_STORAGE_KEY,
                JSON.stringify({
                  token,
                  items: data.items,
                  expiresAt: data.expiresAt,
                  promoCode: String(data.promoCode || ""),
                })
              );
            } else {
              localStorage.removeItem(RECOVERY_STORAGE_KEY);
            }
            try { sessionStorage.setItem("wind_open_cart_once", "1"); } catch { /* ignore */ }
            restored = true;
          }
        } catch {
          // فشل الشبكة: نكمل بتنظيف الرابط والسلة الحالية تفضل زي ما هي.
        }

        params.delete("cart-token");
        const clean = cleanUrl(params);
        if (restored) {
          window.location.replace(clean);
        } else {
          window.history.replaceState(null, "", clean);
        }
      })();
      return;
    }

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
        try { sessionStorage.setItem("wind_open_cart_once", "1"); } catch { /* ignore */ }
      } catch {
        // مساحة التخزين ممتلئة أو تالفة: نتجاهل ونكمل بتنظيف الرابط.
      }
    }

    params.delete("cart");
    const clean = cleanUrl(params);

    if (incoming.length) {
      window.location.replace(clean);
    } else {
      window.history.replaceState(null, "", clean);
    }
  }, []);

  return null;
}
