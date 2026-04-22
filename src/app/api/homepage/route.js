import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'homepage_data_v1';

export async function GET() {
  // 1. جرب KV أولاً
  const cached = await kvGet(CACHE_KEY);
  if (cached) {
    return NextResponse.json(
      { success: true, source: 'cache', data: cached },
      { headers: { 'X-Cache': 'HIT' } }
    );
  }

  // 2. جيب من Firebase
  try {
    const db = getDb();
    const [layoutSnap, heroSnap] = await Promise.all([
      getDoc(doc(db, "homepage", "layout_config")),
      getDoc(doc(db, "homepage", "main-hero"))
    ]);

    const layoutData = layoutSnap.exists() ? layoutSnap.data() : { sections: [] };

    // Price Enrichment
    if (layoutData.sections?.length > 0) {
      const allProductIds = [];
      layoutData.sections.forEach(section => {
        const items = section.data?.cards || section.data?.products || [];
        items.forEach(item => {
          if (item.productId) allProductIds.push(item.productId);
        });
      });

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
          if (section.data?.cards) return { ...section, data: { ...section.data, cards: updatedItems } };
          return { ...section, data: { ...section.data, products: updatedItems } };
        });
      }
    }

    const firebaseData = {
      layout: layoutData,
      hero: heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] }
    };

    // 3. خزّن في KV
    await kvSet(CACHE_KEY, firebaseData);

    return NextResponse.json(
      { success: true, source: 'firebase', data: firebaseData },
      { headers: { 'X-Cache': 'MISS' } }
    );

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}