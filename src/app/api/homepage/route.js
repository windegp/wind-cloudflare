import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
// 🌟 استدعاء الدوال الجاهزة من ملفنا المركزي
import { kvGet, kvSet } from "@/lib/kv-cache"; 

export const dynamic = 'force-dynamic';
const CACHE_KEY = 'homepage_data_v1';

export async function GET() {
  let kvStatus = "NOT_FOUND";

  try {
    // 1. جرب تجيب من KV Cache
    const cachedData = await kvGet(CACHE_KEY);
    
    // الدالة بتاعتنا بترجع JSON جاهز، مش محتاجين نعمل parse
    if (cachedData) {
      return NextResponse.json({
        success: true,
        source: 'cache',
        kv_status: "HIT",
        data: cachedData
      }, {
        headers: { "X-Cache": "HIT" }
      });
    }

    // 2. لو مش موجود، جيب من Firebase
    kvStatus = "MISS_FETCHING_FIREBASE";
    const db = getDb();
    const [layoutSnap, heroSnap] = await Promise.all([
      getDoc(doc(db, "homepage", "layout_config")),
      getDoc(doc(db, "homepage", "main-hero"))
    ]);

    const firebaseData = {
      layout: layoutSnap.exists() ? layoutSnap.data() : { sections: [] },
      hero: heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] }
    };

    // 3. خزّن في KV للأبد
    // الدالة بتاعتنا kvSet بتعمل JSON.stringify أوتوماتيك
    const saved = await kvSet(CACHE_KEY, firebaseData);
    kvStatus = saved ? "SAVED" : "WRITE_ERROR";

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
      kv_status: "ERROR"
    }, { status: 500 });
  }
}