import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

// 🚀 السطر السحري لمنع Next.js من كاش الكود أثناء الـ Build
export const dynamic = 'force-dynamic';

export async function GET() {
  let kvStatus = "NOT_FOUND";
  let kv = null;

  try {
    // محاولة قراءة الخزنة بالطريقة المعتمدة لـ OpenNext على كلودفلير
    if (typeof process !== 'undefined' && process.env.WIND_KV) {
      kv = process.env.WIND_KV;
      kvStatus = "FOUND_IN_PROCESS_ENV";
    } else if (globalThis.__ENV__?.WIND_KV) {
      kv = globalThis.__ENV__.WIND_KV;
      kvStatus = "FOUND_IN_GLOBALTHIS_ENV";
    }

    if (kv) {
      try {
        const cachedData = await kv.get('homepage_data_v1');
        if (cachedData) {
          return NextResponse.json({
            success: true,
            source: 'cache',
            kv_status: kvStatus + "_AND_SERVED",
            data: JSON.parse(cachedData)
          }, {
            headers: {
              "X-Cache": "HIT",
              "Cache-Control": "public, max-age=30, stale-while-revalidate=60"
            }
          });
        }
        kvStatus += "_BUT_EMPTY";
      } catch (kvError) {
        kvStatus += "_READ_ERROR";
      }
    }

    // جلب البيانات من فايربيز لو الخزنة فاضية أو مش موجودة
    const db = getDb();
    const [layoutSnap, heroSnap] = await Promise.all([
      getDoc(doc(db, "homepage", "layout_config")),
      getDoc(doc(db, "homepage", "main-hero"))
    ]);
    
    const firebaseData = {
      layout: layoutSnap.exists() ? layoutSnap.data() : { sections: [] },
      hero: heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] }
    };

    if (kv) {
      try {
        await kv.put('homepage_data_v1', JSON.stringify(firebaseData));
        kvStatus += "_AND_SAVED";
      } catch (storeError) {
        kvStatus += "_WRITE_ERROR";
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
    return NextResponse.json({ success: false, source: 'error', kv_status: kvStatus }, { status: 500 });
  }
}