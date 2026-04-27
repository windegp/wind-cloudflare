import { getCloudflareContext } from '@opennextjs/cloudflare';

// TTL constants for different data types
export const KV_TTL = {
  HOMEPAGE: 86400,      // 24 hours
  PRODUCT: 86400,       // 24 hours
  COLLECTION: 43200,    // 12 hours
  REVIEWS: 3600,        // 1 hour
  SETTINGS: 86400       // 24 hours
};

export async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch {
    return null;
  }
}

export async function kvGet(key) {
  try {
    const kv = await getKV();
    if (!kv) return null;
    const val = await kv.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function kvSet(key, data) {
  try {
    const kv = await getKV();
    if (!kv) return false;
    await kv.put(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export async function kvDelete(key) {
  try {
    const kv = await getKV();
    if (!kv) return false;
    await kv.delete(key);
    return true;
  } catch {
    return false;
  }
}

// ✅ جديد - لحذف أكتر من key دفعة واحدة
export async function kvDeleteMany(keys = []) {
  try {
    const kv = await getKV();
    if (!kv || keys.length === 0) return false;
    await Promise.all(keys.map(k => kv.delete(k)));
    return true;
  } catch {
    return false;
  }
}