import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

export async function GET() {
  // 1. إعداد "الكشاف" لمعرفة حالة الخزنة
  let kvStatus = "NOT_FOUND_IN_ANY_ENVIRONMENT";
  let kv = null;

  try {
    // 2. رحلة البحث عن الخزنة في كلودفلير
    if (typeof process !== 'undefined' && process.env.WIND_KV) {
      kv = process.env.WIND_KV;
      kvStatus = "FOUND_IN_PROCESS_ENV";
    } else if (globalThis.WIND_KV) {
      kv = globalThis.WIND_KV;
      kvStatus = "FOUND_IN_GLOBALTHIS";
    } else if (globalThis.__ENV__?.WIND_KV) {
      kv = globalThis.__ENV__.WIND_KV;
      kvStatus = "FOUND_IN_GLOBALTHIS_ENV";
    }

    // 3. لو الخزنة موجودة، جرب تقرأ منها
    if (kv) {
      try {
        const cachedData = await kv.get('homepage_data_v1');
        if (cachedData) {
          return NextResponse.json({
            success: true,
            source: 'cache',
            kv_status: kvStatus + "_AND_SERVED_FROM_CACHE",
            data: JSON.parse(cachedData)
          }, {
            headers: {
              "X-Cache": "HIT",
              "Cache-Control": "public, max-age=30, stale-while-revalidate=60"
            }
          });
        }
        kvStatus += "_BUT_CACHE_WAS_EMPTY";
      } catch (kvError) {
        kvStatus += "_READ_ERROR: " + kvError.message;
      }
    }

    // 4. الخطة البديلة: جيب من فايربيز
    const db = getDb();
    const layoutRef = doc(db, "homepage", "layout_config");
    const layoutSnap = await getDoc(layoutRef);
    const layoutData = layoutSnap.exists() ? layoutSnap.data() : { sections: [] };
    
    const heroRef = doc(db, "homepage", "main-hero");
    const heroSnap = await getDoc(heroRef);
    const heroData = heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] };
    
    const firebaseData = {
      layout: layoutData,
      hero: heroData
    };

    // 5. لو الخزنة موجودة، خزن الداتا اللي جبناها من فايربيز
    if (kv) {
      try {
        await kv.put('homepage_data_v1', JSON.stringify(firebaseData));
        kvStatus += "_AND_SAVED_SUCCESSFULLY";
      } catch (storeError) {
        kvStatus += "_WRITE_ERROR: " + storeError.message;
      }
    }

    // 6. إرجاع النتيجة للعميل
    return NextResponse.json({
      success: true,
      source: 'firebase',
      kv_status: kvStatus,  // ده السطر اللي هيفضح لنا المشكلة فين!
      data: firebaseData
    }, {
      headers: {
        "X-Cache": "MISS"
      }
    });

  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        source: 'error',
        kv_status: kvStatus,
        error: error.message 
      },
      { status: 500 }
    );
  }
}