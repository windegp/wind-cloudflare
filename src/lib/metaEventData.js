export function normalizePhoneForMetaHash(phone) {
  if (!phone) return undefined;
  const value = String(phone).trim();
  if (!value) return undefined;

  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return undefined;

  if (/^01[0125][0-9]{8}$/.test(digits)) {
    return `2${digits}`;
  }

  if (/^201[0125][0-9]{8}$/.test(digits)) {
    return digits;
  }

  return digits;
}

function addIfPresent(target, key, value) {
  if (value === undefined || value === null) return;
  const normalized = String(value).trim();
  if (!normalized) return;
  target[key] = normalized;
}

export function buildCheckoutMetaUserData(formData = {}, fallback = {}) {
  const data = {};

  addIfPresent(data, "email", formData.email || fallback.email);
  addIfPresent(data, "phone", formData.phone || fallback.phone);
  addIfPresent(data, "first_name", formData.firstName);
  addIfPresent(data, "last_name", formData.lastName);
  addIfPresent(data, "city", formData.city);
  addIfPresent(data, "state", formData.governorate);
  addIfPresent(data, "country", fallback.country || "EG");
  addIfPresent(data, "zip", formData.postalCode);

  return data;
}
// Short-lived, in-memory customer identity for subsequent CAPI events only.
// Never persisted in localStorage/sessionStorage and never passed to fbq().
const META_USER_CONTEXT_TTL_MS = 30 * 60 * 1000;
let rememberedMetaUserData = null;
let rememberedMetaUserDataAt = 0;

export function rememberMetaUserData(formData = {}) {
  const data = {};

  const email = String(formData.email || "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    data.email = email;
  }

  const phone = String(formData.phone || "").trim();
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  if (phoneDigits.length >= 11 && phoneDigits.length <= 15) {
    data.phone = phone;
  }

  const firstName = String(formData.firstName || "").trim();
  if (firstName.length >= 2) data.first_name = firstName;

  const lastName = String(formData.lastName || "").trim();
  if (lastName.length >= 2) data.last_name = lastName;

  const city = String(formData.city || "").trim();
  if (city.length >= 2) data.city = city;

  // Avoid assuming Cairo just because it is the checkout's default selection.
  const state = String(formData.governorate || "").trim();
  if (state.length >= 2 && state !== "القاهرة") data.state = state;

  const zip = String(formData.postalCode || "").trim();
  if (zip.length >= 3) data.zip = zip;

  // Country is known from this store's Egypt-only checkout.
  if (Object.keys(data).length > 0) data.country = "EG";

  rememberedMetaUserData = Object.keys(data).length > 0 ? data : null;
  rememberedMetaUserDataAt = rememberedMetaUserData ? Date.now() : 0;
}

export function getRememberedMetaUserData() {
  if (
    !rememberedMetaUserData ||
    Date.now() - rememberedMetaUserDataAt > META_USER_CONTEXT_TTL_MS
  ) {
    clearRememberedMetaUserData();
    return {};
  }

  return { ...rememberedMetaUserData };
}

export function clearRememberedMetaUserData() {
  rememberedMetaUserData = null;
  rememberedMetaUserDataAt = 0;
}
