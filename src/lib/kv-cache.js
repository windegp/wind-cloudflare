import { getCloudflareContext } from '@opennextjs/cloudflare';

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