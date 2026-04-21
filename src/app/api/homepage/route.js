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

    const layoutData = layoutSnap.exists() ? layoutSnap.data() : { sections: [] };

    // 🔥 Price Enrichment — تحديث أسعار المنتجات من products collection
    if (layoutData.sections?.length > 0) {
      // جمع كل product IDs من كل الـ sections
      const allProductIds = [];
      layoutData.sections.forEach(section => {
        const items = section.data?.cards || section.data?.products || [];
        items.forEach(item => {
          if (item.productId) allProductIds.push(item.productId);
        });
      });

      // جيب أحدث بيانات المنتجات دفعة واحدة
      if (allProductIds.length > 0) {
        const uniqueIds = [...new Set(allProductIds)];
        const { getDocs, collection, query, where, documentId } = await import('firebase/firestore/lite');
        const productsSnap = await getDocs(
          query(collection(db, "products"), where(documentId(), "in", uniqueIds.slice(0, 30)))
        );
        const pricesMap = {};
        productsSnap.docs.forEach(d => {
          pricesMap[d.id] = {
            price: d.data().price,
            compareAtPrice: d.data().compareAtPrice
          };
        });

        // حدّث الأسعار في الـ layout
        layoutData.sections = layoutData.sections.map(section => {
          const items = section.data?.cards || section.data?.products || [];
          if (items.length === 0) return section;

          const updatedItems = items.map(item => {
            if (!item.productId || !pricesMap[item.productId]) return item;
            return {
              ...item,
              price: pricesMap[item.productId].price || item.price,
              compareAtPrice: pricesMap[item.productId].compareAtPrice || item.compareAtPrice
            };
          });

          if (section.data?.cards) {
            return { ...section, data: { ...section.data, cards: updatedItems } };
          }
          return { ...section, data: { ...section.data, products: updatedItems } };
        });
      }
    }

    const firebaseData = {
      layout: layoutData,
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