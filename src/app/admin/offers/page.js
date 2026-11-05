"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDb } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore/lite";
import {
  Tag,
  Plus,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Package,
  Truck,
} from "@/components/icons-extra";

export const dynamic = "force-dynamic";

const TYPE_OPTIONS = [
  { value: "buy_x_get_y", label: "اشترِ X واحصل على Y مجانًا" },
  { value: "nth_percent", label: "خصم على القطعة رقم N" },
  { value: "cart_percent", label: "خصم نسبة على المنتجات المؤهلة" },
  { value: "cart_fixed", label: "خصم مبلغ ثابت على المنتجات المؤهلة" },
];

const emptyForm = () => ({
  name: "",
  type: "buy_x_get_y",
  config: { buyQty: "2", getQty: "1", nth: "2", percent: "40", amount: "100" },
  minCart: "0",
  maxDiscount: "0",
  priority: "100",
  startsAt: "",
  endsAt: "",
  active: true,
  productScope: "all",
  productIds: [],
  excludedProductIds: [],
  excludeDiscounted: false,
  freeShipping: false,
  stackWithOfferIds: [],
});

const emptyShippingRule = () => ({
  enabled: false,
  scope: "store",
  productIds: [],
  condition: "quantity",
  minQuantity: "2",
  minSubtotal: "500",
});

// Production hosts manage live offers. Any other host (Cloudflare branch preview / localhost)
// is isolated using the preview environment tag.
function getCurrentOfferEnvironment() {
  if (typeof window === "undefined") return "preview";
  const host = window.location.hostname.toLowerCase();
  const productionHosts = ["windeg.com", "www.windeg.com", "windeg.pages.dev"];
  return productionHosts.includes(host) ? "production" : "preview";
}

function dateInputValue(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function productKeys(product) {
  return [product.id, product.handle]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map(String);
}

function hasProduct(product, values) {
  const set = new Set(Array.isArray(values) ? values.map(String) : []);
  return productKeys(product).some((key) => set.has(key));
}

function toggleProduct(values, product) {
  const keys = productKeys(product);
  const exists = keys.some((key) => values.includes(key));
  return exists
    ? values.filter((value) => !keys.includes(String(value)))
    : [...new Set([...values, ...keys])];
}

function offerStatus(offer) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  if (offer.active !== true) return { label: "معطّل", className: "bg-gray-100 text-gray-600" };
  if (offer.startsAt && today < String(offer.startsAt).slice(0, 10)) {
    return { label: "لم يبدأ بعد", className: "bg-blue-50 text-blue-700" };
  }
  if (offer.endsAt && today > String(offer.endsAt).slice(0, 10)) {
    return { label: "منتهي", className: "bg-gray-100 text-gray-500" };
  }
  return { label: "نشط", className: "bg-emerald-50 text-emerald-700" };
}

function offerDescription(offer) {
  const cfg = offer.config || {};
  let description = "";
  if (offer.type === "free_shipping") {
    description = "شحن مجاني فقط";
  } else if (offer.type === "buy_x_get_y") {
    description = `اشترِ ${cfg.buyQty} واحصل على ${cfg.getQty} مجانًا`;
  } else if (offer.type === "nth_percent") {
    description = `خصم ${cfg.percent}% على القطعة رقم ${cfg.nth}`;
  } else if (offer.type === "cart_percent") {
    description = `خصم ${cfg.percent}% على المنتجات المؤهلة`;
  } else if (offer.type === "cart_fixed") {
    description = `خصم ${cfg.amount} ج.م على المنتجات المؤهلة`;
  }
  if (offer.freeShipping) description += " + شحن مجاني";
  return description || "إعداد عرض";
}

function ProductPicker({ title, hint, products, selected, search, onSearch, onToggle }) {
  const filtered = products.filter((product) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [product.title, product.handle, product.id]
      .some((value) => String(value || "").toLowerCase().includes(term));
  });

  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-3 bg-gray-50 border-b border-gray-200">
        <div className="font-bold text-sm text-gray-800">{title}</div>
        <p className="text-[11px] text-gray-500 mt-1">{hint}</p>
        <div className="relative mt-3">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="ابحث باسم المنتج أو handle..."
            className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg bg-white text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="p-4 text-xs text-gray-400 text-center">لا توجد منتجات مطابقة</p>
        ) : filtered.map((product) => {
          const checked = hasProduct(product, selected);
          return (
            <label key={product.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(product)}
                className="w-4 h-4 accent-[#008060]"
              />
              {product.images?.[0] || product.mainImage ? (
                <img
                  src={product.images?.[0] || product.mainImage}
                  alt=""
                  className="w-9 h-9 rounded-lg object-cover bg-gray-100"
                />
              ) : (
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Package size={15} className="text-gray-400" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-gray-800 truncate">{product.title || "منتج بدون اسم"}</span>
                <span className="block text-[10px] text-gray-400 truncate">{product.handle || product.id}</span>
              </span>
              <span className="text-[10px] text-gray-400">{checked ? "محدد" : ""}</span>
            </label>
          );
        })}
      </div>
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500">
        {products.filter((product) => hasProduct(product, selected)).length} منتج محدد
      </div>
    </section>
  );
}

export default function AdminOffersPage() {
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [includeSearch, setIncludeSearch] = useState("");
  const [excludeSearch, setExcludeSearch] = useState("");
  const [environment, setEnvironment] = useState("preview");

  const notify = (message, ok = true) => {
    setToast({ message, ok });
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const db = getDb();
      const currentEnvironment = getCurrentOfferEnvironment();
      setEnvironment(currentEnvironment);
      const [offersSnap, productsSnap] = await Promise.all([
        getDocs(collection(db, "offers")),
        getDocs(query(collection(db, "products"), limit(1000))),
      ]);
      const loadedOffers = offersSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((offer) => currentEnvironment === "preview"
          ? offer.environment === "preview"
          : offer.environment !== "preview");
      loadedOffers.sort((a, b) =>
        (Number(a.priority) || 100) - (Number(b.priority) || 100) ||
        String(a.name || "").localeCompare(String(b.name || ""), "ar")
      );
      setOffers(loadedOffers);
      setProducts(productsSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
    } catch (error) {
      setPageError(error?.message || "تعذر تحميل العروض والمنتجات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredOffers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return offers;
    return offers.filter((offer) =>
      [offer.name, offer.id, offer.type].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [offers, search]);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateConfig = (key, value) => setForm((current) => ({
    ...current,
    config: { ...current.config, [key]: value },
  }));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError("");
    setIncludeSearch("");
    setExcludeSearch("");
    setShowForm(true);
  };

  const openEdit = (offer) => {
    setEditingId(offer.id);
    setForm({
      ...emptyForm(),
      ...offer,
      config: {
        buyQty: String(offer.config?.buyQty ?? 2),
        getQty: String(offer.config?.getQty ?? 1),
        nth: String(offer.config?.nth ?? 2),
        percent: String(offer.config?.percent ?? 40),
        amount: String(offer.config?.amount ?? 100),
      },
      minCart: String(offer.minCart ?? 0),
      maxDiscount: String(offer.maxDiscount ?? 0),
      priority: String(offer.priority ?? 100),
      startsAt: dateInputValue(offer.startsAt),
      endsAt: dateInputValue(offer.endsAt),
      productScope: offer.productScope === "selected" ? "selected" : "all",
      productIds: Array.isArray(offer.productIds) ? offer.productIds.map(String) : [],
      excludedProductIds: Array.isArray(offer.excludedProductIds) ? offer.excludedProductIds.map(String) : [],
      active: offer.active === true,
      excludeDiscounted: offer.excludeDiscounted === true,
      freeShipping: offer.freeShipping === true,
    });
    setFormError("");
    setIncludeSearch("");
    setExcludeSearch("");
    setShowForm(true);
  };

  const validate = () => {
    if (!form.name.trim()) return "اسم العرض مطلوب.";
    if (!TYPE_OPTIONS.some((item) => item.value === form.type)) return "نوع العرض غير صحيح.";
    const minCart = Number(form.minCart);
    const maxDiscount = Number(form.maxDiscount);
    const priority = Number(form.priority);
    if (!Number.isFinite(minCart) || minCart < 0) return "الحد الأدنى للطلب يجب أن يكون صفرًا أو أكثر.";
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0) return "سقف الخصم يجب أن يكون صفرًا أو أكثر.";
    if (!Number.isInteger(priority) || priority < 0) return "الأولوية يجب أن تكون رقمًا صحيحًا غير سالب.";
    if (form.startsAt && form.endsAt && form.startsAt > form.endsAt) return "تاريخ النهاية يجب ألا يسبق تاريخ البداية.";

    if (form.type === "buy_x_get_y") {
      if (!Number.isInteger(Number(form.config.buyQty)) || Number(form.config.buyQty) < 1) return "عدد القطع المطلوب شراؤها يجب أن يكون 1 أو أكثر.";
      if (!Number.isInteger(Number(form.config.getQty)) || Number(form.config.getQty) < 1) return "عدد القطع المجانية يجب أن يكون 1 أو أكثر.";
    }
    if (form.type === "nth_percent") {
      if (!Number.isInteger(Number(form.config.nth)) || Number(form.config.nth) < 2) return "رقم القطعة يجب أن يكون 2 أو أكثر.";
      if (!(Number(form.config.percent) > 0 && Number(form.config.percent) <= 100)) return "نسبة الخصم يجب أن تكون بين 1 و100.";
    }
    if (form.type === "cart_percent") {
      if (!(Number(form.config.percent) > 0 && Number(form.config.percent) <= 100)) return "نسبة الخصم يجب أن تكون بين 1 و100.";
    }
    if (form.type === "cart_fixed" && !(Number(form.config.amount) > 0)) return "مبلغ الخصم يجب أن يكون أكبر من صفر.";
    if (form.productScope === "selected" && form.productIds.length === 0) return "اختر منتجًا واحدًا على الأقل أو غيّر النطاق إلى كل المنتجات.";
    return "";
  };

  const revalidateOffers = async () => {
    try {
      await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "offers" }),
      });
    } catch {
      // Offer changes are already saved. The offers endpoint also has a short edge-cache TTL.
    }
  };

  const saveOffer = async () => {
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const numericConfig = {};
      if (form.type === "buy_x_get_y") {
        numericConfig.buyQty = Number(form.config.buyQty);
        numericConfig.getQty = Number(form.config.getQty);
      } else if (form.type === "nth_percent") {
        numericConfig.nth = Number(form.config.nth);
        numericConfig.percent = Number(form.config.percent);
      } else if (form.type === "cart_percent") {
        numericConfig.percent = Number(form.config.percent);
      } else if (form.type === "cart_fixed") {
        numericConfig.amount = Number(form.config.amount);
      }

      const data = {
        name: form.name.trim(),
        type: form.type,
        config: numericConfig,
        minCart: Number(form.minCart) || 0,
        maxDiscount: Number(form.maxDiscount) || 0,
        priority: Number(form.priority),
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        active: Boolean(form.active),
        productScope: form.productScope,
        productIds: form.productScope === "selected" ? form.productIds : [],
        excludedProductIds: form.excludedProductIds,
        excludeDiscounted: Boolean(form.excludeDiscounted),
        freeShipping: form.type === "free_shipping" || Boolean(form.freeShipping),
        environment: getCurrentOfferEnvironment(),
        updatedAt: now,
      };

      if (editingId) {
        await updateDoc(doc(db, "offers", editingId), data);
      } else {
        const randomId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const id = `offer_${randomId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        await setDoc(doc(db, "offers", id), { ...data, createdAt: now });
      }

      await revalidateOffers();
      await loadData();
      setShowForm(false);
      notify(editingId ? "تم تحديث العرض بنجاح." : "تم إنشاء العرض بنجاح.");
    } catch (error) {
      setFormError(error?.message || "تعذر حفظ العرض.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (offer) => {
    setSaving(true);
    try {
      await updateDoc(doc(getDb(), "offers", offer.id), {
        active: offer.active !== true,
        updatedAt: new Date().toISOString(),
      });
      await revalidateOffers();
      setOffers((current) => current.map((item) =>
        item.id === offer.id ? { ...item, active: offer.active !== true } : item
      ));
      notify(offer.active === true ? "تم إيقاف العرض." : "تم تفعيل العرض.");
    } catch (error) {
      notify(error?.message || "تعذر تغيير حالة العرض.", false);
    } finally {
      setSaving(false);
    }
  };

  const removeOffer = async (offer) => {
    const confirmed = window.confirm(`هل تريد حذف العرض "${offer.name}"؟ لا يمكن التراجع عن الحذف.`);
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteDoc(doc(getDb(), "offers", offer.id));
      await revalidateOffers();
      setOffers((current) => current.filter((item) => item.id !== offer.id));
      notify("تم حذف العرض.");
    } catch (error) {
      notify(error?.message || "تعذر حذف العرض.", false);
    } finally {
      setSaving(false);
    }
  };

  const chooseProduct = (listKey, product) => {
    setForm((current) => ({
      ...current,
      [listKey]: toggleProduct(current[listKey], product),
    }));
  };

  const fieldClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#008060]";
  const labelClass = "block text-xs font-bold text-gray-600 mb-1.5";
  const activeType = TYPE_OPTIONS.find((item) => item.value === form.type)?.label || "";

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[70] rounded-xl px-5 py-3 shadow-lg text-sm font-bold flex items-center gap-2 ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
            <Tag size={22} className="text-[#008060]" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-gray-900">العروض التلقائية</h1>
            <p className="text-xs text-gray-500 mt-1">العروض التي يحسبها المتجر تلقائيًا عند وجود منتجات مؤهلة في السلة.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} disabled={loading || saving} className="p-2.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-800 disabled:opacity-50" title="تحديث">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] text-white rounded-lg text-sm font-bold hover:bg-black">
            <Plus size={16} /> إنشاء عرض
          </button>
        </div>
      </header>

      <div className={`rounded-xl border p-4 text-xs ${environment === "preview" ? "bg-sky-50 border-sky-200 text-sky-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
        {environment === "preview" ? (
          <><strong>بيئة معاينة معزولة:</strong> العروض التي تنشئها هنا تُحفظ كعروض Preview ولا تظهر لعملاء windeg.com.</>
        ) : (
          <><strong>تنبيه — بيئة الإنتاج:</strong> أي عرض تحفظه أو تفعّله هنا يؤثر على متجر windeg.com مباشرة.</>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500">إجمالي العروض</div>
          <div className="text-2xl font-black mt-1">{offers.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500">مفعّلة</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{offers.filter((item) => item.active === true).length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500">المنتجات المحمّلة للاختيار</div>
          <div className="text-2xl font-black mt-1">{products.length}</div>
          {products.length >= 1000 && <p className="text-[10px] text-amber-700 mt-1">تم بلوغ حد العرض الحالي: 1000 منتج.</p>}
        </div>
      </div>

      {pageError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          تعذر تحميل البيانات: {pageError}
          <button onClick={loadData} className="mr-3 underline font-bold">إعادة المحاولة</button>
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="font-black text-gray-900">العروض المحفوظة</h2>
            <p className="text-[11px] text-gray-500 mt-1">الخصم النقدي لا يتجمع: يختار المحرك أفضل قيمة بين العرض والكود وخصم الطلب الأول.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في العروض..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400" />
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400"><RefreshCw size={18} className="inline animate-spin ml-2" /> جاري تحميل العروض...</div>
        ) : filteredOffers.length === 0 ? (
          <div className="py-16 text-center">
            <Tag size={30} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-bold text-gray-600">{search ? "لا توجد نتائج مطابقة" : "لا توجد عروض بعد"}</p>
            <p className="text-xs text-gray-400 mt-1">أنشئ أول عرض من زر «إنشاء عرض».</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredOffers.map((offer) => {
              const status = offerStatus(offer);
              return (
                <article key={offer.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-gray-900">{offer.name || "عرض بدون اسم"}</h3>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${status.className}`}>{status.label}</span>
                      {offer.freeShipping && <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700">شحن مجاني</span>}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{offerDescription(offer)}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-2">
                      <span>الأولوية: {Number(offer.priority) || 100}</span>
                      <span>الحد الأدنى: {Number(offer.minCart) || 0} ج.م</span>
                      <span>سقف الخصم: {Number(offer.maxDiscount) > 0 ? `${offer.maxDiscount} ج.م` : "بدون سقف"}</span>
                      <span>{offer.productScope === "selected" ? `${products.filter((product) => hasProduct(product, offer.productIds || [])).length} منتج مستهدف` : "كل المنتجات"}</span>
                      {(offer.excludedProductIds || []).length > 0 && <span>مستثنى: {products.filter((product) => hasProduct(product, offer.excludedProductIds || [])).length} منتج</span>}
                      {offer.excludeDiscounted && <span>يستثني المنتجات المخفّضة</span>}
                      {offer.startsAt && <span>من: {String(offer.startsAt).slice(0, 10)}</span>}
                      {offer.endsAt && <span>إلى: {String(offer.endsAt).slice(0, 10)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActive(offer)} disabled={saving} className={`px-3 py-2 rounded-lg text-xs font-bold border disabled:opacity-50 ${offer.active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                      {offer.active ? "إيقاف" : "تفعيل"}
                    </button>
                    <button onClick={() => openEdit(offer)} disabled={saving} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50" title="تعديل">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => removeOffer(offer)} disabled={saving} className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50" title="حذف">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-black">ملاحظات طريقة الحساب</p>
        <p>• في عروض اشترِ X واحصل على Y، تُمنح الميزة للقطع الأرخص داخل كل مجموعة مكتملة.</p>
        <p>• في عرض القطعة رقم N، تُحسب القطع من الأغلى إلى الأرخص، وتحصل القطعة الأرخص في المجموعة على النسبة المحددة.</p>
        <p>• قيمة «الحد الأدنى» تُقاس على مجموع المنتجات المؤهلة للعرض، وليس إجمالي الطلب.</p>
        <p>• الأولوية الأقل تُستخدم فقط عند تساوي قيمة الخصم بين عرضين تلقائيين.</p>
        <p>• الشحن المجاني منفعة مستقلة؛ يمكن أن يطبق مع الخصم النقدي الفائز من مصدر آخر.</p>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-[60] bg-black/50 overflow-y-auto p-3 sm:p-6 flex items-start justify-center">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl my-3" dir="rtl">
            <div className="sticky top-0 bg-white z-10 px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-black text-gray-900">{editingId ? "تعديل العرض" : "إنشاء عرض جديد"}</h2>
                <p className="text-[11px] text-gray-500 mt-1">{activeType}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>اسم العرض *</label>
                  <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="مثال: الجمعة البيضاء - 40% على القطعة الثانية" className={fieldClass} />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>نوع العرض *</label>
                  <select value={form.type} onChange={(event) => updateField("type", event.target.value)} className={fieldClass}>
                    {TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>

                {form.type === "buy_x_get_y" && (
                  <>
                    <div><label className={labelClass}>عدد القطع المطلوب شراؤها (X)</label><input type="number" min="1" step="1" value={form.config.buyQty} onChange={(event) => updateConfig("buyQty", event.target.value)} className={fieldClass} /></div>
                    <div><label className={labelClass}>عدد القطع المجانية (Y)</label><input type="number" min="1" step="1" value={form.config.getQty} onChange={(event) => updateConfig("getQty", event.target.value)} className={fieldClass} /></div>
                  </>
                )}
                {form.type === "nth_percent" && (
                  <>
                    <div><label className={labelClass}>رقم القطعة داخل المجموعة (N)</label><input type="number" min="2" step="1" value={form.config.nth} onChange={(event) => updateConfig("nth", event.target.value)} className={fieldClass} /><p className="text-[10px] text-gray-400 mt-1">مثال: N=2 يعني القطعة الثانية في كل مجموعة.</p></div>
                    <div><label className={labelClass}>نسبة الخصم على القطعة (%)</label><input type="number" min="1" max="100" step="1" value={form.config.percent} onChange={(event) => updateConfig("percent", event.target.value)} className={fieldClass} /></div>
                  </>
                )}
                {form.type === "cart_percent" && (
                  <div><label className={labelClass}>نسبة الخصم (%)</label><input type="number" min="1" max="100" step="1" value={form.config.percent} onChange={(event) => updateConfig("percent", event.target.value)} className={fieldClass} /></div>
                )}
                {form.type === "cart_fixed" && (
                  <div><label className={labelClass}>مبلغ الخصم (ج.م)</label><input type="number" min="1" step="1" value={form.config.amount} onChange={(event) => updateConfig("amount", event.target.value)} className={fieldClass} /></div>
                )}

                <div><label className={labelClass}>الحد الأدنى لقيمة المنتجات المؤهلة (ج.م)</label><input type="number" min="0" step="1" value={form.minCart} onChange={(event) => updateField("minCart", event.target.value)} className={fieldClass} /><p className="text-[10px] text-gray-400 mt-1">اكتب 0 لإلغاء الحد الأدنى.</p></div>
                <div><label className={labelClass}>أقصى مبلغ للخصم (ج.م)</label><input type="number" min="0" step="1" value={form.maxDiscount} onChange={(event) => updateField("maxDiscount", event.target.value)} className={fieldClass} /><p className="text-[10px] text-gray-400 mt-1">اكتب 0 ليكون الخصم بلا سقف.</p></div>
                <div><label className={labelClass}>الأولوية عند التعادل</label><input type="number" min="0" step="1" value={form.priority} onChange={(event) => updateField("priority", event.target.value)} className={fieldClass} /><p className="text-[10px] text-gray-400 mt-1">الرقم الأقل يفوز عند تساوي الخصم بين عرضين.</p></div>
                <div className="flex items-center gap-3">
                  <input id="offer-exclude-discounted" type="checkbox" checked={form.excludeDiscounted} onChange={(event) => updateField("excludeDiscounted", event.target.checked)} className="w-4 h-4 accent-[#008060]" />
                  <label htmlFor="offer-exclude-discounted" className="text-sm font-bold text-gray-700">استثناء المنتجات المخفّضة بالفعل</label>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 space-y-3">
                <div className="font-black text-sm text-gray-800">نطاق المنتجات</div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="offer-scope" checked={form.productScope === "all"} onChange={() => updateField("productScope", "all")} className="accent-[#008060]" /> كل المنتجات</label>
                  <label className="flex items-center gap-2"><input type="radio" name="offer-scope" checked={form.productScope === "selected"} onChange={() => updateField("productScope", "selected")} className="accent-[#008060]" /> منتجات محددة فقط</label>
                </div>
                {form.productScope === "selected" && (
                  <ProductPicker
                    title="المنتجات المستهدفة"
                    hint="العرض سيُحسب على المنتجات التي تحددها فقط. يتم حفظ معرّف المنتج والـ handle للتوافق مع السلة."
                    products={products}
                    selected={form.productIds}
                    search={includeSearch}
                    onSearch={setIncludeSearch}
                    onToggle={(product) => chooseProduct("productIds", product)}
                  />
                )}
                <ProductPicker
                  title="استثناء منتجات من العرض (اختياري)"
                  hint="هذه المنتجات لن تستفيد من العرض حتى لو كان النطاق يشمل كل المنتجات."
                  products={products}
                  selected={form.excludedProductIds}
                  search={excludeSearch}
                  onSearch={setExcludeSearch}
                  onToggle={(product) => chooseProduct("excludedProductIds", product)}
                />
                {products.length === 0 && <p className="text-xs text-amber-700">لم يتم تحميل المنتجات. تحقق من اتصال Firebase ثم أعد المحاولة.</p>}
              </div>

              <div className="border-t border-gray-100 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelClass}>يبدأ من (اختياري)</label><input type="date" value={form.startsAt} onChange={(event) => updateField("startsAt", event.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>ينتهي في (اختياري)</label><input type="date" value={form.endsAt} onChange={(event) => updateField("endsAt", event.target.value)} min={form.startsAt || undefined} className={fieldClass} /></div>
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <input type="checkbox" checked={form.freeShipping || form.type === "free_shipping"} disabled={form.type === "free_shipping"} onChange={(event) => updateField("freeShipping", event.target.checked)} className="w-4 h-4 accent-[#008060] disabled:opacity-60" />
                  <span><span className="block text-sm font-bold text-gray-800">شحن مجاني مع العرض</span><span className="block text-[10px] text-gray-500 mt-1">تُطبق فقط مع هذا العرض إذا كان هو العرض الفائز، ولا تُجمع تلقائيًا مع عرض شحن آخر.</span></span>
                  <Truck size={18} className="mr-auto text-gray-400" />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <input type="checkbox" checked={form.active} onChange={(event) => updateField("active", event.target.checked)} className="w-4 h-4 accent-[#008060]" />
                  <span><span className="block text-sm font-bold text-gray-800">العرض مفعّل</span><span className="block text-[10px] text-gray-500 mt-1">يمكن حفظ العرض معطّلًا لتجهيزه لاحقًا.</span></span>
                </label>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" /> {formError}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 sm:px-6 flex gap-3 rounded-b-2xl">
              <button onClick={saveOffer} disabled={saving} className="flex-1 py-3 rounded-xl bg-[#1a1a1a] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={16} /> {saving ? "جاري الحفظ..." : editingId ? "حفظ التعديلات" : "إنشاء العرض"}
              </button>
              <button onClick={() => setShowForm(false)} disabled={saving} className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
