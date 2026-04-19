import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
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

export async function GET() {
  let kvStatus = "NOT_FOUND";

  try {
    const kv = await getKV();

    if (kv) {
      kvStatus = "FOUND";
      try {
        const cached = await kv.get(CACHE_KEY);
        if (cached) {
          return NextResponse.json({
            success: true,
            source: 'cache',
            kv_status: "HIT",
            data: JSON.parse(cached)
          }, {
            headers: { "X-Cache": "HIT" }
          });
        }
        kvStatus = "FOUND_BUT_EMPTY";
      } catch {
        kvStatus = "READ_ERROR";
      }
    }

    // جيب من Firebase
    const db = getDb();
    const [layoutSnap, heroSnap] = await Promise.all([
      getDoc(doc(db, "homepage", "layout_config")),
      getDoc(doc(db, "homepage", "main-hero"))
    ]);

    const firebaseData = {
      layout: layoutSnap.exists() ? layoutSnap.data() : { sections: [] },
      hero: heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] }
    };

    // خزّن في KV
    if (kv) {
      try {
        await kv.put(CACHE_KEY, JSON.stringify(firebaseData));
        kvStatus = "SAVED";
      } catch {
        kvStatus = "WRITE_ERROR";
      }
    }

    return NextResponse.json({
      success: true,
      source: 'firebase',
      kv_status: kvStatus,
      data: firebaseData
    }, {
      headers: { "X-Cache": "MISS" }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      kv_status: kvStatus
    }, { status: 500 });
  }
}