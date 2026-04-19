import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'homepage_data_v1';

async function getKV() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.WIND_KV || null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const { secret, keys } = await request.json();

    if (secret !== process.env.REVALIDATE_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const kv = await getKV();
    if (!kv) {
      return NextResponse.json({ revalidated: true, note: "KV not available" });
    }

    const keysToDelete = keys?.length ? keys : [CACHE_KEY];
    await Promise.all(keysToDelete.map(k => kv.delete(k)));

    return NextResponse.json({ revalidated: true, keys: keysToDelete });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}