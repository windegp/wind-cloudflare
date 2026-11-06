import { getDb } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { computeBestOffer, computeStackedOfferBenefits, isFreeShippingRuleEligible } from "@/lib/offerEngine";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from "@/lib/constants";

const MAX_CART_LINES = 50;
const MAX_QTY_PER_LINE = 100;
const MAX_TOTAL_UNITS = 500;

export class CheckoutQuoteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CheckoutQuoteError";
    this.status = status;
  }
}

function money(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getProductByIdentifier(db, item) {
  const identifiers = [
    item?.id,
    item?.productId,
    item?.handle,
    item?.productHandle,
  ].filter((value) => value !== undefined && value !== null && String(value).trim());

  if (!identifiers.length) {
    throw new CheckoutQuoteError("تعذر تحديد أحد المنتجات في السلة. أعد إضافة المنتج وحاول مرة أخرى.");
  }

  for (const identifier of [...new Set(identifiers.map(String))]) {
    const direct = await getDoc(doc(db, "products", identifier));
    if (direct.exists()) {
      let product = { id: direct.id, ...direct.data() };
      if (product.status === "Redirected" && product.redirectedTo) {
        const target = await getDoc(doc(db, "products", String(product.redirectedTo)));
        if (target.exists()) product = { id: target.id, ...target.data() };
      }
      return product;
    }

    const byHandle = await getDocs(
      query(collection(db, "products"), where("handle", "==", identifier), limit(1))
    );
    if (!byHandle.empty) {
      const found = byHandle.docs[0];
      let product = { id: found.id, ...found.data() };
      if (product.status === "Redirected" && product.redirectedTo) {
        const target = await getDoc(doc(db, "products", String(product.redirectedTo)));
        if (target.exists()) product = { id: target.id, ...target.data() };
      }
      return product;
    }
  }

  throw new CheckoutQuoteError("أحد المنتجات في السلة لم يعد متاحاً. احذفه من السلة ثم أضفه مرة أخرى.", 409);
}

function matchesVariant(product, item) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) return true;

  const selectedColor = String(item.selectedColor || "").trim().toLowerCase();
  const selectedSize = String(item.selectedSize || "").trim().toLowerCase();
  if (!selectedColor && !selectedSize) return true;

  return variants.some((variant) => {
    const first = String(variant.option1Value || "").trim().toLowerCase();
    const second = String(variant.option2Value || "").trim().toLowerCase();
    const colorMatch = !selectedColor || first === selectedColor || second === selectedColor;
    const sizeMatch = !selectedSize || first === selectedSize || second === selectedSize;
    return colorMatch && sizeMatch;
  });
}

function getBundleProductHandles(product) {
  const raw = product?.metafields?.bundleProducts;
  if (typeof raw !== "string") return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function applyVerifiedBundlePricing(items) {
  const groups = new Map();
  for (const item of items) {
    if (!item.bundleGroupId && (item.bundleRole || item.bundleParentId)) {
      throw new CheckoutQuoteError("بيانات الباقة غير مكتملة. احذف منتجات الباقة وأضفها مرة أخرى.", 409);
    }
    if (!item.bundleGroupId) continue;
    const key = String(item.bundleGroupId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  for (const group of groups.values()) {
    const parentLines = group.filter((item) => item.bundleRole === "parent");
    if (parentLines.length !== 1 || group.some((item) => item.bundleRole !== "parent" && item.bundleRole !== "child")) {
      throw new CheckoutQuoteError("تعذر التحقق من إحدى الباقات في السلة. أعد إضافة الباقة.", 409);
    }

    const parent = parentLines[0];
    const parentId = String(parent.bundleParentId || "");
    if (!parentId || parent.id !== parentId) {
      throw new CheckoutQuoteError("تعذر التحقق من المنتج الأساسي للباقة. أعد إضافة الباقة.", 409);
    }

    const allowedHandles = getBundleProductHandles(parent._product);
    for (const child of group.filter((item) => item.bundleRole === "child")) {
      const childKeys = [String(child.id), String(child.handle)];
      if (!childKeys.some((key) => allowedHandles.includes(key))) {
        throw new CheckoutQuoteError("أحد المنتجات لم يعد ضمن هذه الباقة. أعد اختيار الباقة.", 409);
      }
    }

    const configuredDiscount = Number(parent._product?.metafields?.bundleDiscount ?? 0);
    const discountPercent =
      group.length >= 2 && Number.isFinite(configuredDiscount)
        ? Math.min(100, Math.max(0, configuredDiscount))
        : 0;

    let bundleSubtotal = 0;
    for (const item of group) {
      const basePrice = item.price;
      item.price = Math.round(basePrice * (1 - discountPercent / 100));
      item.compareAtPrice = discountPercent > 0 ? basePrice : item.compareAtPrice;
      bundleSubtotal += item.price * item.qty;
    }

    const rawLimit = Number(parent._product?.metafields?.bundleFreeShipping ?? 1850);
    const freeShippingLimit = Number.isFinite(rawLimit) ? rawLimit : 1850;
    const bundleFreeShipping = freeShippingLimit > 0 && bundleSubtotal >= freeShippingLimit;
    for (const item of group) item.bundleFreeShipping = bundleFreeShipping;
  }
}

async function resolveCartItems(db, cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > MAX_CART_LINES) {
    throw new CheckoutQuoteError("السلة غير صالحة. حدّث الصفحة وحاول مرة أخرى.");
  }

  let totalUnits = 0;
  const resolved = [];

  for (const item of cartItems) {
    const qty = Number(item?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new CheckoutQuoteError("كمية أحد المنتجات غير صالحة. راجع السلة.");
    }
    totalUnits += qty;
    if (totalUnits > MAX_TOTAL_UNITS) {
      throw new CheckoutQuoteError("عدد القطع في السلة يتجاوز الحد المسموح.");
    }

    const product = await getProductByIdentifier(db, item);
    if (!matchesVariant(product, item)) {
      throw new CheckoutQuoteError("أحد المقاسات أو الألوان المختارة لم يعد متاحاً. راجع خيارات المنتج.", 409);
    }

    const price = money(product.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new CheckoutQuoteError("تعذر تأكيد سعر أحد المنتجات. يرجى التواصل معنا.");
    }

    const compareAtValue = money(product.compareAtPrice);
    const compareAtPrice =
      Number.isFinite(compareAtValue) && compareAtValue > price ? compareAtValue : null;

    // A legacy bundle line can carry a discounted client price without the
    // server-verifiable bundle identity introduced with this quote flow.
    // Ask the customer to re-add it rather than trusting that client price.
    const submittedPrice = money(item.price);
    const submittedCompareAt = money(item.compareAtPrice);
    if (
      !item.bundleGroupId &&
      Number.isFinite(submittedPrice) &&
      submittedPrice < price &&
      Number.isFinite(submittedCompareAt) &&
      submittedCompareAt >= price
    ) {
      throw new CheckoutQuoteError(
        "تم تحديث تسعير إحدى الباقات. احذف منتجات الباقة من السلة وأضفها مرة أخرى لإعادة تطبيق سعرها."
      , 409);
    }

    resolved.push({
      id: product.id,
      productId: product.id,
      handle: String(product.handle || product.id),
      productHandle: String(product.handle || product.id),
      title: String(product.title || item.title || "منتج"),
      price,
      compareAtPrice,
      qty,
      selectedSize: String(item.selectedSize || ""),
      selectedColor: String(item.selectedColor || ""),
      image: String(item.image || product.images?.[0] || product.mainImage || ""),
      bundleFreeShipping: false,
      bundleGroupId: item.bundleGroupId ? String(item.bundleGroupId) : "",
      bundleParentId: item.bundleParentId ? String(item.bundleParentId) : "",
      bundleRole: item.bundleRole || "",
      _product: product,
    });
  }

  applyVerifiedBundlePricing(resolved);
  return resolved;
}

async function checkFirstOrder(db, email, phone) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedEmail || !normalizedEmail.includes("@") || normalizedPhone.length < 11) return false;

  const [emailSnap, phoneDocSnap] = await Promise.all([
    getDoc(doc(db, "Customers", normalizedEmail)),
    getDoc(doc(db, "Customers", normalizedPhone)),
  ]);

  if (emailSnap.exists() && Number(emailSnap.data()["Total Orders"] || 0) > 0) return false;
  if (phoneDocSnap.exists() && Number(phoneDocSnap.data()["Total Orders"] || 0) > 0) return false;

  const phoneQuery = await getDocs(
    query(collection(db, "Customers"), where("Phone", "==", String(phone).trim()), limit(1))
  );
  if (!phoneQuery.empty && Number(phoneQuery.docs[0].data()["Total Orders"] || 0) > 0) return false;

  return true;
}

async function validatePromo(db, code, customer, cartItems, isFirstOrder, now) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) return null;

  const snap = await getDoc(doc(db, "promoCodes", normalizedCode));
  if (!snap.exists()) throw new CheckoutQuoteError("كود الخصم غير صالح.");
  const promo = snap.data();

  if (promo.active !== true) throw new CheckoutQuoteError("كود الخصم غير مفعّل حالياً.");

  const expiry = toDate(promo.expiresAt);
  if (promo.expiresAt && (!expiry || now > expiry)) {
    throw new CheckoutQuoteError("انتهت صلاحية كود الخصم.");
  }

  if (promo.usageType === "single_use" || promo.usageType === "limited") {
    const maxUses = Math.max(1, Number(promo.maxUses) || 1);
    if ((Number(promo.usedCount) || 0) >= maxUses) {
      throw new CheckoutQuoteError("تم استنفاد عدد مرات استخدام هذا الكود.");
    }
  }

  const identifier = customer.email || normalizePhone(customer.phone);
  if (promo.firstOrderOnly && !isFirstOrder) {
    throw new CheckoutQuoteError("هذا الكود مخصص للطلب الأول فقط.");
  }

  if (promo.usageType === "once_per_customer" && identifier) {
    const usedBy = Array.isArray(promo.usedBy) ? promo.usedBy.map((value) => String(value).toLowerCase()) : [];
    if (usedBy.includes(identifier.toLowerCase())) {
      throw new CheckoutQuoteError("سبق لك استخدام كود الخصم هذا.");
    }
  }

  let applicableItems = cartItems;
  if (Array.isArray(promo.scope) && promo.scope.length > 0) {
    const scope = promo.scope.map(String);
    applicableItems = cartItems.filter((item) =>
      scope.includes(String(item.id)) || scope.includes(String(item.handle))
    );
    if (!applicableItems.length) {
      throw new CheckoutQuoteError("كود الخصم لا ينطبق على المنتجات الموجودة في سلتك.");
    }
  } else if (promo.scope && promo.scope !== "all" && !Array.isArray(promo.scope)) {
    throw new CheckoutQuoteError("إعداد نطاق كود الخصم غير صالح. يرجى التواصل معنا.", 409);
  }

  const applicableSubtotal = applicableItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  let discountAmount = 0;
  const freeShipping = promo.type === "free_shipping";

  if (promo.type === "percent") {
    const percent = Number(promo.value);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new CheckoutQuoteError("إعداد نسبة كود الخصم غير صالح. يرجى التواصل معنا.", 409);
    }
    discountAmount = Math.round((applicableSubtotal * percent) / 100);
  } else if (promo.type === "fixed") {
    const fixed = Number(promo.value);
    if (!Number.isFinite(fixed) || fixed <= 0) {
      throw new CheckoutQuoteError("إعداد كود الخصم غير صالح. يرجى التواصل معنا.", 409);
    }
    discountAmount = Math.min(fixed, applicableSubtotal);
  } else if (!freeShipping) {
    throw new CheckoutQuoteError("نوع كود الخصم غير مدعوم.", 409);
  }

  return {
    valid: true,
    code: normalizedCode,
    type: promo.type,
    value: Number(promo.value) || 0,
    usageType: promo.usageType || "unlimited",
    firstOrderOnly: Boolean(promo.firstOrderOnly),
    freeShipping,
    discountAmount,
    message: freeShipping
      ? "تم تفعيل الشحن المجاني."
      : `تم التحقق من كود الخصم ${normalizedCode}.`,
  };
}

function chooseBestDiscount({ offerResult, promo, firstOrderDiscount }) {
  const options = [];

  if (promo?.valid && promo.type !== "free_shipping" && promo.discountAmount > 0) {
    options.push({ source: "promo", discount: promo.discountAmount, rank: 1 });
  }
  if (firstOrderDiscount > 0) {
    options.push({ source: "first_order", discount: firstOrderDiscount, rank: 2 });
  }
  if (offerResult?.discount > 0) {
    options.push({ source: "offer", discount: offerResult.discount, rank: 3 });
  }

  options.sort((a, b) => b.discount - a.discount || a.rank - b.rank);
  return options[0] || { source: "none", discount: 0, rank: 99 };
}

/**
 * Calculates checkout prices exclusively from current Firestore product,
 * offer, promo-code and site-settings data. Client-supplied prices are ignored.
 */
export async function createServerCheckoutQuote(input = {}) {
  const db = getDb();
  const now = new Date();
  const customer = {
    email: String(input.customerEmail || "").trim().toLowerCase(),
    phone: String(input.customerPhone || "").trim(),
  };

  const items = await resolveCartItems(db, input.cartItems);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const offersEnvironment = input.offersEnvironment === "preview" ? "preview" : "production";
  const [settingsSnap, offersSnap, shippingRulesSnap] = await Promise.all([
    getDoc(doc(db, "settings", "siteSettings")),
    getDocs(collection(db, "offers")),
    getDoc(doc(db, "settings", `offerShippingRules_${offersEnvironment}`)),
  ]);

  const settings = settingsSnap.exists() ? settingsSnap.data() : {};
  const promotions = settings.promotions || {};
  const freeShippingRule = shippingRulesSnap.exists() ? shippingRulesSnap.data() : null;
  // Avoid customer-document reads when the first-order discount is disabled
  // and no promo code was entered.
  const isFirstOrder =
    promotions.firstOrderEnabled === true || Boolean(input.promoCode)
      ? await checkFirstOrder(db, customer.email, customer.phone)
      : false;
  const offers = offersSnap.docs
    .map((offerDoc) => ({ id: offerDoc.id, ...offerDoc.data() }))
    .filter((offer) => offer.active === true && (offersEnvironment === "preview"
      ? offer.environment === "preview"
      : offer.environment !== "preview"));

  const promo = await validatePromo(
    db,
    input.promoCode,
    customer,
    items,
    isFirstOrder,
    now
  );

  const firstOrderDiscount =
    isFirstOrder &&
    promotions.firstOrderEnabled === true &&
    Number(promotions.firstOrderDiscount) > 0 &&
    Number(promotions.firstOrderDiscount) <= 100
      ? Math.round((subtotal * Number(promotions.firstOrderDiscount)) / 100)
      : 0;

  const offerResult = computeBestOffer(items, offers, now);
  const winner = chooseBestDiscount({ offerResult, promo, firstOrderDiscount });
  const discount = Math.min(subtotal, Math.max(0, Math.round(winner.discount)));

  const shippingCostByGovernorate = promotions.shippingCostByGovernorate || {};
  const configuredShipping =
    shippingCostByGovernorate[input.governorate] ??
    promotions.shippingCost ??
    SHIPPING_COST;
  const shippingCost = Math.max(0, Number(configuredShipping) || 0);
  const freeShippingThreshold = Math.max(
    0,
    Number(promotions.freeShippingThreshold ?? FREE_SHIPPING_THRESHOLD) || 0
  );
  // Existing store-wide threshold remains independent from selected-product shipping rules.
  const freeShippingByThreshold = freeShippingThreshold > 0 && subtotal >= freeShippingThreshold;
  const freeShippingByPromo = Boolean(promo?.freeShipping);
  const freeShippingByBundle = items.some((item) => item.bundleFreeShipping === true);
  const freeShippingByRule = isFreeShippingRuleEligible(items, freeShippingRule);
  const shipping =
    freeShippingByThreshold || freeShippingByPromo || freeShippingByBundle || freeShippingByRule
      ? 0
      : shippingCost;
  const total = Math.max(0, Number((subtotal - discount + shipping).toFixed(2)));

  const appliedPromo =
    promo && (promo.freeShipping || winner.source === "promo") ? promo : null;
  const appliedOffer = winner.source === "offer" ? offerResult.offer : null;
  const appliedOffers = winner.source === "offer" ? offerResult.appliedOffers : [];
  const offerBenefits = winner.source === "offer"
    ? computeStackedOfferBenefits(items, appliedOffers, now)
    : null;

  const benefitsByCartIndex = new Map(
    (offerBenefits?.lines || []).map((line) => [line.cartIndex, line])
  );
  const lineItems = items.flatMap((item, cartIndex) => {
    const baseLine = {
      productId: item.productId,
      productHandle: item.productHandle,
      productTitle: item.title,
      name: `${item.title}${item.selectedSize ? " - " + item.selectedSize : ""}`,
      compareAtPrice: item.compareAtPrice,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
      image: item.image,
    };
    const benefitLine = benefitsByCartIndex.get(cartIndex);
    if (!benefitLine) {
      return [{ ...baseLine, price: item.price, quantity: item.qty }];
    }

    const lines = [];
    if (benefitLine.regularQty > 0) {
      lines.push({ ...baseLine, price: item.price, quantity: benefitLine.regularQty });
    }
    benefitLine.discountedUnits.forEach((unit) => {
      lines.push({
        ...baseLine,
        price: unit.finalPrice,
        originalPrice: unit.originalPrice,
        unitDiscount: unit.discount,
        quantity: 1,
        isOfferBenefit: true,
        isFree: unit.free,
        offerId: offerBenefits.offerId,
        offerIds: offerBenefits.offerIds,
        offerType: offerBenefits.offers.map((offer) => offer.type).join("+"),
        offerTypes: offerBenefits.offers.map((offer) => offer.type),
        offerNames: offerBenefits.offers.map((offer) => offer.name),
      });
    });
    return lines;
  });

  const originalSubtotal = items.reduce(
    (sum, item) => sum + (item.compareAtPrice ?? item.price) * item.qty,
    0
  );
  const productDiscountTotal = items.reduce(
    (sum, item) => sum + Math.max(0, (item.compareAtPrice ?? item.price) - item.price) * item.qty,
    0
  );

  return {
    subtotal,
    discount,
    shipping,
    total,
    discountSource: winner.source,
    appliedOffer,
    appliedOffers,
    offerBenefits,
    appliedPromo,
    isFirstOrder,
    lineItems,
    cartItems: items.map(({ _product, ...item }) => item),
    originalSubtotal,
    productDiscountTotal,
    freeShipping: shipping === 0,
    freeShippingByThreshold,
    freeShippingByPromo,
    freeShippingByBundle,
    freeShippingByRule,
    firstOrderDiscount: promotions.firstOrderEnabled ? Number(promotions.firstOrderDiscount) || 0 : 0,
  };
}
