import { getGoogleAccessToken } from "@/lib/googleServiceAccount";

const SCOPE = "https://www.googleapis.com/auth/datastore";
export class OrderStoreError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// Kept separate from the legacy helper: orders need nested maps, arrays and atomic writes.
export function encodeOrderValue(value) {
  if (value == null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeOrderValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeOrderFields(value) } };
  throw new OrderStoreError("INVALID_ORDER_VALUE", 400);
}
export function encodeOrderFields(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, encodeOrderValue(value)]));
}
export function decodeOrderValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeOrderValue);
  if ("mapValue" in value) return decodeOrderFields(value.mapValue.fields || {});
  if ("nullValue" in value) return null;
  throw new OrderStoreError("UNSUPPORTED_ORDER_VALUE");
}
export function decodeOrderFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeOrderValue(value)]));
}

export function assertOrderStoreConfiguration() {
  if (!["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]
    .every(key => typeof process.env[key] === "string" && process.env[key].trim())) {
    throw new OrderStoreError("ORDER_STORAGE_NOT_CONFIGURED");
  }
  const project = process.env.FIREBASE_PROJECT_ID;
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) throw new OrderStoreError("INVALID_FIREBASE_PROJECT_ID");
}
function documentName(collection, id) {
  if (![collection, id].every(segment => typeof segment === "string" && segment.length <= 200 && /^[A-Za-z0-9_.@+-]+$/.test(segment))) {
    throw new OrderStoreError("INVALID_ORDER_DOCUMENT_ID", 400);
  }
  return `projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;
}
async function request(path, { method = "GET", body } = {}) {
  assertOrderStoreConfiguration();
  let accessToken;
  try { accessToken = await getGoogleAccessToken(SCOPE); }
  catch (_) { throw new OrderStoreError("ORDER_STORAGE_AUTH_FAILED"); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
      method, signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) {
      // Never log provider error bodies, credentials, customer data, or tokens.
      const payload = await response.json().catch(() => ({}));
      const conflict = [409, 412].includes(response.status) || ["ALREADY_EXISTS", "FAILED_PRECONDITION", "ABORTED"].includes(payload.error?.status);
      throw new OrderStoreError(conflict ? "ORDER_WRITE_CONFLICT" : "ORDER_STORAGE_UNAVAILABLE", conflict ? 409 : 503);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof OrderStoreError) throw error;
    throw new OrderStoreError("ORDER_STORAGE_UNAVAILABLE");
  } finally { clearTimeout(timeout); }
}

export const serverOrderStore = {
  async get(collection, id) {
    assertOrderStoreConfiguration();
    const result = await request(documentName(collection, id));
    return result ? { data: decodeOrderFields(result.fields || {}), version: result.updateTime } : null;
  },
  async listDue(collection, { states, before, limit = 20 } = {}) {
    assertOrderStoreConfiguration();
    documentName(collection, "validate");
    if (!Array.isArray(states) || !states.length || states.length > 10 ||
        !states.every(v => typeof v === "string" && /^[a-z_]+$/.test(v)) ||
        !Number.isFinite(Date.parse(before)) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new OrderStoreError("INVALID_ORDER_QUERY", 400);
    }
    const result = await request(`projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, {
      method: "POST", body: { structuredQuery: {
        from: [{ collectionId: collection }],
        where: { compositeFilter: { op: "AND", filters: [
          { fieldFilter: { field: { fieldPath: "state" }, op: "IN", value: encodeOrderValue(states) } },
          { fieldFilter: { field: { fieldPath: "nextAttemptAt" }, op: "LESS_THAN_OR_EQUAL", value: encodeOrderValue(before) } },
        ] } },
        orderBy: [{ field: { fieldPath: "nextAttemptAt" }, direction: "ASCENDING" }], limit,
      } },
    });
    return result.filter(row => row.document).map(row => ({
      id: row.document.name.split("/").pop(), data: decodeOrderFields(row.document.fields || {}), version: row.document.updateTime,
    }));
  },
  async commit(writes) {
    assertOrderStoreConfiguration();
    if (!Array.isArray(writes) || !writes.length || writes.length > 50) throw new OrderStoreError("INVALID_ORDER_BATCH", 400);
    const body = { writes: writes.map(write => {
      const result = { update: { name: documentName(write.collection, write.id), fields: encodeOrderFields(write.data) } };
      if (write.create) result.currentDocument = { exists: false };
      else if (write.version) result.currentDocument = { updateTime: write.version };
      else throw new OrderStoreError("ORDER_PRECONDITION_REQUIRED", 400);
      if (write.merge) result.updateMask = { fieldPaths: Object.keys(write.data).map(key => `\`${key.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``) };
      return result;
    }) };
    return request(`projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`, { method: "POST", body });
  },
};
