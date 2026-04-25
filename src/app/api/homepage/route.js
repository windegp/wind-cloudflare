import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvFirstFetch, TTL, getStaleThresholdForKey } from '@/lib/kv-cache';

export const revalidate = 300;

const CACHE_KEY = 'homepage_data_v2'; // v2 for TTL support

export async function GET() {
  // 🚀 KV-first fetch with stale-while-revalidate (TTL: 300s, Stale: 600s)
  const result = await kvFirstFetch(
    CACHE_KEY,
    async () => fetchHomepageData(),
    TTL.HOMEPAGE_DATA,
    getStaleThresholdForKey(CACHE_KEY),
    'medium'
  );

  // Log cache status
  const isHit = result.source === 'cache' || result.source === 'cache-stale';
  console.log(`[KV ${isHit ? 'HIT' : 'MISS'}] homepage: ${result.source}${result.isStale ? ' (stale)' : ''}`);

  // Return cached/stale data immediately
  if (isHit) {
    return NextResponse.json(
      { 
        success: true, 
        source: result.source, 
        data: result.data,
        isStale: result.isStale 
      },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${TTL.HOMEPAGE_DATA}, stale-while-revalidate=${getStaleThresholdForKey(CACHE_KEY) - TTL.HOMEPAGE_DATA}`,
          'X-Cache': result.isStale ? 'HIT-STALE' : 'HIT',
          'X-Cache-TTL': String(TTL.HOMEPAGE_DATA),
          'X-Cache-Source': result.source,
          'X-Cache-Reason': result.isStale ? 'kv-stale-served-background-refresh' : 'kv-fresh-hit'
        }
      }
    );
  }

  // Firestore miss - data already fetched by kvFirstFetch
  return NextResponse.json(
    { 
      success: true, 
      source: 'firebase', 
      data: result.data 
    },
    {
      headers: {
        'Cache-Control': `public, s-maxage=${TTL.HOMEPAGE_DATA}, stale-while-revalidate=${getStaleThresholdForKey(CACHE_KEY) - TTL.HOMEPAGE_DATA}`,
        'X-Cache': 'MISS',
        'X-Cache-TTL': String(TTL.HOMEPAGE_DATA),
        'X-Cache-Source': 'firestore',
        'X-Cache-Reason': 'kv-empty-or-expired'
      }
    }
  );
}

/**
 * Fetches homepage data from Firestore
 */
async function fetchHomepageData() {
  const startedAt = Date.now();

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

    const durationMs = Date.now() - startedAt;
    if (durationMs > 400) {
      console.warn(`[Firestore Slow Query] homepage_data_v2 took ${durationMs}ms`);
    }

    return firebaseData;

  } catch (error) {
    console.error('[API Homepage] Error fetching:', error);
    throw error;
  }
}
