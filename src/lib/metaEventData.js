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
