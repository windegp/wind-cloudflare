"use client";

/**
 * WIND Shopping — Inventory Migration Tool
 * Phase 6 · Step 1 of 4
 *
 * تنفّذ هذه الصفحة migration بثلاث خطوات منفصلة ومستقلة:
 *
 * Step 1 — Data Cleanup (آلي، لا قرارات تجارية)
 *   - تصفير كل quantity سالبة → 0
 *   - تعيين inventoryManaged = true لكل variant
 *   - تعيين expectedAvailabilityDate = null لكل variant
 *   - إضافة variantId (NanoID) ثابت لكل variant
 *   - تسجيل inventoryUpdatedAt بوقت الـ migration
 *
 * Step 2 — Status Initialization (نقطة بداية مؤقتة، NOT اتخاذ قرار)
 *   - كل variants تحصل على inventoryStatus = "NEEDS_REVIEW"
 *   - لا يُشتق أي status من quantity (Golden Rule)
 *   - الـ status المؤقت هذا لا يُعرض للعملاء ولا يُرسل لـ Meta
 *   - يظل محجوباً حتى يراجعه الأدمن يدوياً ويعيّن status حقيقي
 *
 * Step 3 — Site Settings (إضافة inventory config)
 *   - إضافة inventory.defaultLowStockThreshold = 5 لـ siteSettings
 *
 * بعد Migration: الأدمن يراجع كل variant ويعيّن inventoryStatus الحقيقي
 * من Admin Inventory Panel (الخطوة 2 من التنفيذ)
 *
 * ⚠️ هذه الصفحة تُنفَّذ مرة واحدة فقط، وتبقى للرجوع إليها.
 *    بعد انتهاء المراجعة البشرية يمكن تعطيلها.
 */

import { useState, useCallback } from "react";
import { getDb } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore/lite";

// ─── NanoID implementation (no external dependency) ──────────────────────────
// URL-safe, 21 chars, collision probability negligible for this scale
const NANOID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function nanoId(size = 12) {
  let id = "var_";
  for (let i = 0; i < size; i++) {
    id += NANOID_CHARS[Math.floor(Math.random() * NANOID_CHARS.length)];
  }
  return id;
}

// ─── Inventory Status Enum ────────────────────────────────────────────────────
// NEEDS_REVIEW = حالة مؤقتة للـ migration فقط، لا تظهر للعملاء
const INVENTORY_STATUS = {
  NEEDS_REVIEW: "NEEDS_REVIEW", // مؤقت — migration فقط
  IN_STOCK: "IN_STOCK",
  LOW_STOCK: "LOW_STOCK",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  PRE_ORDER: "PRE_ORDER",
  BACKORDER: "BACKORDER",
  COMING_SOON: "COMING_SOON",
  TEMP_DISABLED: "TEMP_DISABLED",
  DISCONTINUED: "DISCONTINUED",
  ARCHIVED: "ARCHIVED",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const BATCH_SIZE = 5; // عدد المنتجات per batch لتجنب Firestore rate limits

export const dynamic = "force-dynamic";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InventoryMigrationPage() {
  const [isDryRun, setIsDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | preview | running | done | error

  const addLog = useCallback((message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString("ar-EG", { hour12: false });
    setLogs((prev) => [...prev, { message, type, timestamp }]);
  }, []);

  // ─── Preview: تحليل البيانات الحالية بدون كتابة ─────────────────────────
  const runPreview = useCallback(async () => {
    setIsRunning(true);
    setPhase("preview");
    setLogs([]);
    setStats(null);

    try {
      addLog("جاري تحليل البيانات الحالية...", "info");
      const db = getDb();
      const snapshot = await getDocs(
        collection(db, "products")
      );

      let totalProducts = 0;
      let activeProducts = 0;
      let totalVariants = 0;
      let negativeQtyCount = 0;
      let noVariantsCount = 0;
      let alreadyHasStatus = 0;
      let alreadyHasVariantId = 0;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        totalProducts++;
        if (data.status !== "Active") return;
        activeProducts++;

        const variants = data.variants || [];
        if (variants.length === 0) {
          noVariantsCount++;
        }

        variants.forEach((v) => {
          totalVariants++;
          const qty = typeof v.quantity === "number" ? v.quantity : parseInt(v.quantity) || 0;
          if (qty < 0) negativeQtyCount++;
          if (v.inventoryStatus) alreadyHasStatus++;
          if (v.variantId) alreadyHasVariantId++;
        });
      });

      const previewStats = {
        totalProducts,
        activeProducts,
        totalVariants,
        negativeQtyCount,
        noVariantsCount,
        alreadyHasStatus,
        alreadyHasVariantId,
      };

      setStats(previewStats);

      addLog(`✅ تحليل مكتمل`, "success");
      addLog(`منتجات إجمالية: ${totalProducts}`, "data");
      addLog(`منتجات نشطة (Active): ${activeProducts}`, "data");
      addLog(`Variants إجمالية: ${totalVariants}`, "data");
      addLog(`Variants بكمية سالبة (ستُصفَّر → 0): ${negativeQtyCount}`, negativeQtyCount > 0 ? "warn" : "data");
      addLog(`منتجات بدون variants array: ${noVariantsCount}`, "data");
      addLog(`Variants لديها inventoryStatus مسبقاً: ${alreadyHasStatus}`, "data");
      addLog(`Variants لديها variantId مسبقاً: ${alreadyHasVariantId}`, "data");

      if (alreadyHasStatus > 0) {
        addLog(
          `⚠️ تحذير: ${alreadyHasStatus} variant لديها inventoryStatus. Migration ستعيد تعيين كل variant لـ NEEDS_REVIEW إذا كان status = NEEDS_REVIEW أو غير موجود. Variants التي لديها status حقيقي (IN_STOCK إلخ) لن تُمَس.`,
          "warn"
        );
      }

      setPhase("preview");
    } catch (err) {
      addLog(`❌ خطأ: ${err.message}`, "error");
      setPhase("error");
    } finally {
      setIsRunning(false);
    }
  }, [addLog]);

  // ─── Migration: التنفيذ الفعلي ───────────────────────────────────────────
  const runMigration = useCallback(async () => {
    setIsRunning(true);
    setPhase("running");
    setLogs([]);

    const mode = isDryRun ? "[DRY RUN]" : "[LIVE]";
    addLog(`🚀 بدء Migration ${mode}`, "info");

    try {
      const db = getDb();
      const now = new Date().toISOString();

      // ── Step 1: Data Cleanup + Status Init ─────────────────────────────
      addLog("─── Step 1: Data Cleanup + variantId + Status Init ───", "section");

      const snapshot = await getDocs(collection(db, "products"));
      const docs = snapshot.docs.filter(
        (d) => d.data().status === "Active"
      );

      addLog(`معالجة ${docs.length} منتج نشط...`, "info");

      let updatedProducts = 0;
      let updatedVariants = 0;
      let skippedVariants = 0;
      let normalizedQty = 0;

      // Process in batches to avoid rate limits
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batchDocs = docs.slice(i, i + BATCH_SIZE);

        for (const docSnap of batchDocs) {
          const data = docSnap.data();
          const productId = docSnap.id;
          const variants = data.variants || [];

          if (variants.length === 0) {
            // منتج بدون variants — لا تعديل على variants
            addLog(`  ⊘ ${productId}: بدون variants، يُتجاهل`, "dim");
            continue;
          }

          let productChanged = false;
          const updatedVariants_ = variants.map((v) => {
            const updated = { ...v };
            let changed = false;

            // 1a. variantId — يُضاف فقط إذا لم يكن موجوداً (idempotent)
            if (!updated.variantId) {
              updated.variantId = nanoId(12);
              changed = true;
            }

            // 1b. quantity — تصفير السالبة فقط، لا نمس الموجبة
            const currentQty =
              typeof updated.quantity === "number"
                ? updated.quantity
                : parseInt(updated.quantity) || 0;
            if (currentQty < 0) {
              if (!isDryRun) updated.quantity = 0;
              normalizedQty++;
              changed = true;
            } else {
              // تأكد أن quantity دائماً رقم صحيح وليس string
              if (typeof updated.quantity !== "number") {
                if (!isDryRun) updated.quantity = Math.max(0, parseInt(updated.quantity) || 0);
                changed = true;
              }
            }

            // 1c. inventoryManaged — يُعيَّن true إذا لم يكن موجوداً
            if (updated.inventoryManaged === undefined) {
              if (!isDryRun) updated.inventoryManaged = true;
              changed = true;
            }

            // 1d. expectedAvailabilityDate — يُعيَّن null إذا لم يكن موجوداً
            if (updated.expectedAvailabilityDate === undefined) {
              if (!isDryRun) updated.expectedAvailabilityDate = null;
              changed = true;
            }

            // 1e. inventoryNote — يُعيَّن "" إذا لم يكن موجوداً
            if (updated.inventoryNote === undefined) {
              if (!isDryRun) updated.inventoryNote = "";
              changed = true;
            }

            // 1f. inventoryUpdatedAt — يُعيَّن بوقت Migration
            if (!updated.inventoryUpdatedAt) {
              if (!isDryRun) updated.inventoryUpdatedAt = now;
              changed = true;
            }

            // ── Step 2: Status Initialization ──────────────────────────
            // القاعدة الذهبية: لا نشتق Status من Quantity
            // NEEDS_REVIEW = علامة مؤقتة، الأدمن يراجعها ويعيّن status حقيقي
            //
            // نحافظ على أي status حقيقي موجود مسبقاً (idempotent migration)
            const hasRealStatus =
              updated.inventoryStatus &&
              updated.inventoryStatus !== INVENTORY_STATUS.NEEDS_REVIEW &&
              Object.values(INVENTORY_STATUS).includes(updated.inventoryStatus);

            if (!hasRealStatus) {
              if (!isDryRun) updated.inventoryStatus = INVENTORY_STATUS.NEEDS_REVIEW;
              changed = true;
            } else {
              skippedVariants++;
            }

            if (changed) {
              updatedVariants++;
              productChanged = true;
            }

            return updated;
          });

          if (productChanged) {
            if (!isDryRun) {
              await updateDoc(doc(db, "products", productId), {
                variants: updatedVariants_,
              });
              updatedProducts++;
              addLog(`  ✓ ${productId}: ${variants.length} variants مُعدَّلة`, "success");
            } else {
              addLog(`  [DRY RUN] ${productId}: ${variants.length} variants ستُعدَّل`, "warn");
            }
          } else {
            addLog(`  ⊘ ${productId}: لا تعديلات مطلوبة`, "dim");
          }
        }

        // تأخير بسيط بين الـ batches لتجنب rate limits
        if (i + BATCH_SIZE < docs.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      addLog(``, "spacer");
      addLog(`Step 1+2 مكتمل:`, "success");
      addLog(`  منتجات معدَّلة: ${updatedProducts}`, "data");
      addLog(`  Variants معدَّلة: ${updatedVariants}`, "data");
      addLog(`  Variants بـ status حقيقي (لم تُمَس): ${skippedVariants}`, "data");
      addLog(`  Quantities سالبة صُفِّرت: ${normalizedQty}`, normalizedQty > 0 ? "warn" : "data");

      // ── Step 3: Site Settings ─────────────────────────────────────────
      addLog("─── Step 3: Site Settings — inventory config ───", "section");

      const settingsRef = doc(db, "settings", "siteSettings");
      const settingsSnap = await getDoc(settingsRef);

      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        const existingThreshold =
          settingsData?.inventory?.defaultLowStockThreshold;

        if (existingThreshold !== undefined) {
          addLog(
            `  ⊘ inventory.defaultLowStockThreshold موجود مسبقاً (${existingThreshold}) — لن يُعدَّل`,
            "dim"
          );
        } else {
          if (!isDryRun) {
            await updateDoc(settingsRef, {
              "inventory.defaultLowStockThreshold": DEFAULT_LOW_STOCK_THRESHOLD,
            });
            addLog(
              `  ✓ تم إضافة inventory.defaultLowStockThreshold = ${DEFAULT_LOW_STOCK_THRESHOLD}`,
              "success"
            );
          } else {
            addLog(
              `  [DRY RUN] سيُضاف inventory.defaultLowStockThreshold = ${DEFAULT_LOW_STOCK_THRESHOLD} (لم يُكتَب بعد)`,
              "warn"
            );
          }
        }
      } else {
        addLog(
          `  ⚠️ مستند siteSettings غير موجود`,
          "warn"
        );
        if (!isDryRun) {
          await setDoc(
            settingsRef,
            { inventory: { defaultLowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD } },
            { merge: true }
          );
          addLog(`  ✓ تم إنشاء siteSettings مع inventory config`, "success");
        } else {
          addLog(`  [DRY RUN] سيُنشأ siteSettings مع inventory config (لم يُكتَب بعد)`, "warn");
        }
      }

      addLog(``, "spacer");

      if (isDryRun) {
        addLog(
          `🔍 DRY RUN مكتمل — لم يُكتَب أي شيء في Firestore`,
          "warn"
        );
        addLog(
          `قم بإلغاء تحديد "Dry Run" ثم اضغط "تشغيل Migration" للتنفيذ الفعلي.`,
          "info"
        );
      } else {
        addLog(`✅ Migration مكتمل بنجاح`, "success");
        addLog(``, "spacer");
        addLog(`─── الخطوات التالية ───`, "section");
        addLog(`1. افتح Admin Inventory Panel (متاح قريباً)`, "info");
        addLog(`2. راجع كل منتج وعيّن inventoryStatus الحقيقي لكل variant`, "info");
        addLog(`3. Variants بـ NEEDS_REVIEW لن تظهر للعملاء ولن تُرسل لـ Meta حتى تراجعها`, "info");
      }

      setPhase("done");
    } catch (err) {
      addLog(`❌ خطأ فادح: ${err.message}`, "error");
      console.error("Migration error:", err);
      setPhase("error");
    } finally {
      setIsRunning(false);
    }
  }, [isDryRun, addLog]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0d0d] p-6 font-sans" dir="rtl">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">📦</span>
            <h1 className="text-2xl font-black text-white">
              WIND <span className="text-yellow-400">Inventory Migration</span>
            </h1>
          </div>
          <p className="text-gray-400 text-sm">
            Phase 6 · Step 1 of 4 · تُنفَّذ مرة واحدة فقط
          </p>
        </div>

        {/* Architecture Note */}
        <div className="bg-[#1a1a1a] border border-yellow-400/30 rounded-2xl p-5 mb-6">
          <h2 className="text-yellow-400 font-bold text-sm mb-3">
            ⚡ Golden Rule — محفوظة في كل خطوة
          </h2>
          <div className="space-y-1 text-xs text-gray-400">
            <p>❌ لا يُشتق أي <code className="text-yellow-300">inventoryStatus</code> من <code className="text-yellow-300">quantity</code></p>
            <p>✅ كل variant يحصل على <code className="text-green-400">NEEDS_REVIEW</code> — علامة مؤقتة للمراجعة البشرية</p>
            <p>✅ الـ status الحقيقي يُعيَّن يدوياً من Admin Inventory Panel</p>
            <p>✅ Variants بـ NEEDS_REVIEW لا تظهر للعملاء ولا تُرسل لـ Meta</p>
          </div>
        </div>

        {/* Steps Overview */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { num: "1", label: "Data Cleanup", desc: "تصفير القيم السالبة، إضافة variantId" },
            { num: "2", label: "Status Init", desc: "تعيين NEEDS_REVIEW لكل variant" },
            { num: "3", label: "Site Settings", desc: "إضافة Low Stock Threshold" },
          ].map((step) => (
            <div
              key={step.num}
              className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4"
            >
              <div className="text-yellow-400 font-black text-lg mb-1">
                {step.num}
              </div>
              <div className="text-white font-bold text-xs mb-1">
                {step.label}
              </div>
              <div className="text-gray-500 text-xs">{step.desc}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => !isRunning && setIsDryRun((v) => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isDryRun ? "bg-yellow-400" : "bg-green-500"
                } ${isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    isDryRun ? "right-1" : "left-1"
                  }`}
                />
              </div>
              <div>
                <span className="text-white font-bold text-sm">
                  {isDryRun ? "🔍 Dry Run (آمن)" : "⚡ Live Mode"}
                </span>
                <p className="text-gray-500 text-xs mt-0.5">
                  {isDryRun
                    ? "تحليل بدون كتابة — آمن تماماً"
                    : "سيُكتَب في Firestore فعلياً"}
                </p>
              </div>
            </label>

            {!isDryRun && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-red-400 text-xs font-bold">⚠️ Live Mode</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={runPreview}
              disabled={isRunning}
              className="flex-1 py-3 rounded-xl text-sm font-bold border border-[#444] text-gray-300 hover:border-yellow-400/50 hover:text-yellow-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🔍 معاينة البيانات
            </button>
            <button
              onClick={runMigration}
              disabled={isRunning}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isDryRun
                  ? "bg-yellow-400 text-black hover:bg-yellow-300"
                  : "bg-green-500 text-white hover:bg-green-400"
              }`}
            >
              {isRunning
                ? "جاري التنفيذ..."
                : isDryRun
                ? "🔍 تشغيل (Dry Run)"
                : "🚀 تشغيل Migration"}
            </button>
          </div>
        </div>

        {/* Stats Preview */}
        {stats && (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 mb-6">
            <h3 className="text-white font-bold text-sm mb-4">
              📊 نتائج التحليل
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "منتجات نشطة", value: stats.activeProducts, color: "text-green-400" },
                { label: "Variants إجمالية", value: stats.totalVariants, color: "text-blue-400" },
                {
                  label: "كميات سالبة",
                  value: stats.negativeQtyCount,
                  color: stats.negativeQtyCount > 0 ? "text-red-400" : "text-gray-400",
                },
                {
                  label: "بدون variants",
                  value: stats.noVariantsCount,
                  color: "text-gray-400",
                },
                {
                  label: "لديها variantId",
                  value: stats.alreadyHasVariantId,
                  color: "text-gray-400",
                },
                {
                  label: "لديها status مسبق",
                  value: stats.alreadyHasStatus,
                  color: stats.alreadyHasStatus > 0 ? "text-yellow-400" : "text-gray-400",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-[#111] rounded-xl p-3 flex justify-between items-center"
                >
                  <span className="text-gray-400 text-xs">{item.label}</span>
                  <span className={`${item.color} font-bold text-sm`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm">📋 سجل التنفيذ</h3>
              <button
                onClick={() => {
                  const text = logs
                    .map((l) => `[${l.timestamp}] ${l.message}`)
                    .join("\n");
                  navigator.clipboard.writeText(text);
                }}
                className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
              >
                نسخ السجل
              </button>
            </div>
            <div className="space-y-0.5 max-h-96 overflow-y-auto font-mono text-xs">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-3 py-0.5 ${
                    log.type === "spacer"
                      ? "opacity-0 h-2"
                      : log.type === "section"
                      ? "text-yellow-400/80 mt-2"
                      : log.type === "success"
                      ? "text-green-400"
                      : log.type === "error"
                      ? "text-red-400"
                      : log.type === "warn"
                      ? "text-yellow-400"
                      : log.type === "data"
                      ? "text-blue-300"
                      : log.type === "dim"
                      ? "text-gray-600"
                      : "text-gray-300"
                  }`}
                >
                  <span className="text-gray-700 shrink-0">{log.timestamp}</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Done State */}
        {phase === "done" && !isDryRun && (
          <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-2xl p-5 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-green-400 font-bold mb-2">
              Migration مكتمل بنجاح
            </h3>
            <p className="text-gray-400 text-sm">
              الخطوة التالية: Admin Inventory Panel — راجع كل variant وعيّن
              inventoryStatus الحقيقي
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 text-xs">
          <p>WIND Shopping · Phase 6 Migration Tool · تُنفَّذ مرة واحدة فقط</p>
        </div>
      </div>
    </div>
  );
}
