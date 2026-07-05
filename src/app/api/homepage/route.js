import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import { kvGet, kvSet } from '@/lib/kv-cache';
import { isProductHiddenFromListings } from '@/lib/inventoryHelpers';

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
    if (layoutData.sections && layoutData.sections.length > 0) {
      const allProductIds = [];
      layoutData.sections.forEach(section => {
        const sectionData = section.data || {};
        const items = sectionData.cards || sectionData.products || [];
        items.forEach(item => {
          if (item.productId) allProductIds.push(item.productId);
        });
      });

      if (allProductIds.length > 0) {
        const uniqueIds = [...new Set(allProductIds)];
        const { getDocs, collection, query, where, documentId } = await import('firebase/firestore/lite');

        // Fetch product prices
        const productsSnap = await getDocs(
          query(collection(db, "products"), where(documentId(), "in", uniqueIds.slice(0, 30)))
        );
        const pricesMap = {};
        // 🔥 Phase 8: منتجات SEASONAL (كل الـ variants SEASONAL) تُستبعَد من الصفحة الرئيسية
        const hiddenIds = new Set();
        // 🔥 Fix: رابط المنتج المحفوظ في Home Manager هو Snapshot وقت الإضافة فقط —
        // لو الأدمن غيّر رابط (handle) المنتج بعدين، الرابط القديم يفضل محفوظاً هنا
        // للأبد لحد ما حد يفتح Home Manager ويحفظ القسم تاني يدوياً. بدل الاعتماد على
        // ده، نحل أي تحويل (redirect) هنا بنفس طريقة صفحة المنتج بالظبط، فالرابط المعروض
        // في الصفحة الرئيسية يكون دايماً هو الرابط الحالي الصحيح، مهما كان المخزّن قديم.
        const redirectMap = {}; // originalProductId -> finalCanonicalId
        const redirectedStubIds = [];
        productsSnap.docs.forEach(d => {
          const data = d.data();
          if (data.status === "Redirected" && data.redirectedTo) {
            redirectMap[d.id] = data.redirectedTo;
            redirectedStubIds.push(data.redirectedTo);
          } else {
            pricesMap[d.id] = {
              price: data.price,
              compareAtPrice: data.compareAtPrice
            };
            if (isProductHiddenFromListings(data.variants)) {
              hiddenIds.add(d.id);
            }
          }
        });

        // لو فيه منتجات اتحوّلت (redirect stubs)، اجيب بيانات المنتج الحقيقي (الجديد)
        // عشان السعر/الحالة يكونوا صح كمان مش بس الرابط
        if (redirectedStubIds.length > 0) {
          const targetsSnap = await getDocs(
            query(collection(db, "products"), where(documentId(), "in", [...new Set(redirectedStubIds)].slice(0, 30)))
          );
          targetsSnap.docs.forEach(d => {
            const data = d.data();
            pricesMap[d.id] = { price: data.price, compareAtPrice: data.compareAtPrice };
            if (isProductHiddenFromListings(data.variants)) hiddenIds.add(d.id);
          });
        }

        // Fetch review stats from ProductStats
        const statsSnap = await getDocs(
          query(collection(db, "ProductStats"), where(documentId(), "in", uniqueIds.slice(0, 30)))
        );
        const statsMap = {};
        statsSnap.docs.forEach(d => {
          const data = d.data();
          const total = data.totalCount || 0;
          statsMap[d.id] = {
            reviewsCount: total,
            rating: total > 0 ? parseFloat((data.totalRatingSum / total).toFixed(1)) : 5
          };
        });

        layoutData.sections = layoutData.sections.map(section => {
          const sectionData = section.data || {};
          const items = sectionData.cards || sectionData.products || [];
          if (items.length === 0) return section;
          const updatedItems = items
            .filter(item => {
              if (!item.productId) return true;
              const finalId = redirectMap[item.productId] || item.productId;
              return !hiddenIds.has(finalId);
            })
            .map(item => {
            if (!item.productId) return item;
            const finalId = redirectMap[item.productId] || item.productId;
            const priceData = pricesMap[finalId] || {};
            const statsData = statsMap[item.productId] || statsMap[finalId] || {};
            return {
              ...item,
              productId: finalId,
              // 🔥 دايماً نعيد بناء الرابط من الـ id الحالي الصحيح، مش من linkUrl المخزَّن
              linkUrl: item.linkUrl && !item.linkUrl.startsWith('/products/')
                ? item.linkUrl // روابط غير منتجات (مثلاً /collections/..) تفضل زي ما هي
                : `/products/${finalId}`,
              price: priceData.price || item.price,
              compareAtPrice: priceData.compareAtPrice || item.compareAtPrice,
              reviewsCount: (statsData.reviewsCount != null ? statsData.reviewsCount : (item.reviewsCount != null ? item.reviewsCount : 0)),
              rating: (statsData.rating != null ? statsData.rating : (item.rating != null ? item.rating : 5))
            };
          });
          if (sectionData.cards) return { ...section, data: { ...sectionData, cards: updatedItems } };
          return { ...section, data: { ...sectionData, products: updatedItems } };
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