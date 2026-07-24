// app/products/[id]/page.js
import { getDb } from "@/lib/firebase"; 
import { getFirebaseEdge, getEdgeDb } from "@/lib/firebase-edge";
import { doc, getDoc } from "firebase/firestore/lite";
import ProductView from "./ProductView"; 
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { kvGet, kvSet } from "@/lib/kv-cache"; // 🔥 KV Cache
import { getVariantBehavior } from "@/lib/inventoryHelpers";
import { buildBreadcrumbJsonLd } from "@/lib/seo-helpers";

// Use edge-compatible Firebase when running on edge runtime
const isEdgeRuntime = typeof window === 'undefined' && process.env.NEXT_RUNTIME === 'edge';
const firestoreDb = isEdgeRuntime ? getEdgeDb() : getDb(); 

// تم تغليف الدالة بـ cache لضمان جلب المنتج مرة واحدة فقط لكل طلب سيرفر (توفير كوتا)
// 🔥 الآن ترجع أيضاً علامة "ترحيل" (redirectTo) لو المستند تم نقله لرابط جديد،
// بدل بيانات المنتج العادية — يستخدمها كل من generateMetadata و Page لعمل تحويل 301 فوري.
const getProductData = cache(async (id) => {
  if (!id) return null;

  // 1. حاول تجيب من KV Cache
  const cacheKey = `product_${id}`;
  const cached = await kvGet(cacheKey);
  if (cached) {
    // 🔥 لو النسخة المخزّنة في الكاش (من قبل الترحيل) تحمل علامة ترحيل قديمة، نحترمها فوراً
    if (cached.status === "Redirected" && cached.redirectedTo) {
      return { __redirectTo: cached.redirectedTo };
    }
    return cached;
  }

  // 2. اجيب من Firebase (مرة واحدة بس لحد ما يحصل تحديث)
  try {
    const docRef = doc(firestoreDb, "products", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();

      // 🔥 المستند تم ترحيله لرابط جديد — لا نخزّنه في KV كمنتج عادي،
      // بل نرجع فقط الرابط الجديد للتحويل الفوري (هذا حالة نادرة ومؤقتة، فلا داعي لتخزينها بنفس آلية المنتجات)
      if (data.status === "Redirected" && data.redirectedTo) {
        return { __redirectTo: data.redirectedTo };
      }

      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate().toISOString();
      }
      if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        data.updatedAt = data.updatedAt.toDate().toISOString();
      }

      const product = { id: docSnap.id, ...data };

      // 4. خزّن في KV للأبد
      await kvSet(cacheKey, product);

      return product;
    }
  } catch (error) {
    console.error("Error fetching product:", error);
  }
  return null;
});

// 1. الجزء الخاص بـ Metadata
export async function generateMetadata({ params }) {
  const { id } = await params; // 🔥 Next.js 15 Fix
  const product = await getProductData(id);

  // 🔥 المنتج تم نقله لرابط جديد — نوجّه محركات البحث/فيسبوك للرابط الصحيح فوراً
  if (product?.__redirectTo) {
    return {
      title: "إعادة توجيه... | WIND",
      alternates: { canonical: `https://windeg.com/products/${product.__redirectTo}` },
    };
  }

  if (!product) return { title: "المنتج غير موجود | WIND" };

  // سحب بيانات السيو من حقل الـ seo (Map) في فايربيز
  const finalTitle = product.seo?.title || `${product.title} | WIND`;
  
  // تنظيف الوصف الأساسي من الـ HTML كبديل آمن لو مفيش وصف سيو
  const cleanFallbackDesc = product.description 
    ? String(product.description).replace(/<[^>]+>/g, '').substring(0, 160) 
    : `تسوقي ${product.title} من WIND. جودة وتصاميم عصرية.`;
    
  const finalDescription = product.seo?.description || cleanFallbackDesc;

  return {
    title: finalTitle,
    description: finalDescription,
    keywords: product.tags ? product.tags.split(',').map(tag => tag.trim()) : [],
    alternates: { canonical: `https://windeg.com/products/${id}` },
    openGraph: {
      title: finalTitle,
      description: finalDescription,
      url: `https://windeg.com/products/${id}`, // ✅ تم تحديث الرابط بـ S
      siteName: 'WIND',
      images: [{ url: product.images?.[0] || product.mainImage || "" }],
      type: 'article',
    },
  };
}

// 2. الصفحة الرئيسية
export default async function Page({ params, searchParams }) {
  const { id } = await params; // 🔥 Next.js 15 Fix
  const sParams = await searchParams; // 🔥 Next.js 15 Fix
  const sourceCat = sParams?.cat;
  const product = await getProductData(id);

  // 🔥 المنتج تم نقله لرابط جديد (handle تغيّر من الإدارة) — تحويل 301 فوري
  // يحافظ على فهرسة محركات البحث وفعالية الإعلانات القديمة بدل عرض صفحة فاضية
  if (product?.__redirectTo) {
    redirect(`/products/${product.__redirectTo}`);
  }

  if (!product) notFound();

  // تنظيف الوصف الخاص بمخطط جوجل (Schema)
  const cleanSchemaDesc = product.description 
    ? String(product.description).replace(/<[^>]+>/g, '').substring(0, 200) 
    : "";

  // البيانات المنظمة JSON-LD لمحركات البحث
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.title,
    "image": product.images || [product.mainImage || ""],
    "description": product.seo?.description || cleanSchemaDesc,
    "brand": {
      "@type": "Brand",
      "name": product.vendor || "WIND"
    },
    "offers": {
      "@type": "Offer",
      "url": `https://windeg.com/products/${id}`, // ✅ تم تحديث الرابط بـ S
      "priceCurrency": "EGP",
      "price": product.price || "0",
      "availability": (() => {
        // Phase 6: availability من inventoryStatus — Golden Rule
        // fallback للمنتجات legacy بدون variants (AD-2)
        const variants = product.variants;
        if (variants && Array.isArray(variants) && variants.length > 0) {
          const anyPurchasable = variants.some(v => getVariantBehavior(v.inventoryStatus).canPurchase);
          return anyPurchasable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
        }
        // legacy fallback: منتجات بدون variants
        const legacyAvailable = (Number(product.quantity) > 0 || product.sellOutOfStock === "Yes");
        return legacyAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
      })(),
      "itemCondition": "https://schema.org/NewCondition"
    }
  };

  // 🔥 SEO: BreadcrumbList منفصل تماماً عن Product schema أعلاه — بدون أي تعديل عليه
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "WIND Shopping", url: "https://windeg.com" },
    { name: product.title, url: `https://windeg.com/products/${id}` },
  ]);

  // تأمين أخير لضمان تمرير داتا نظيفة للواجهة
  const sanitizedProduct = JSON.parse(JSON.stringify(product));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductView initialProduct={sanitizedProduct} sourceCategory={sourceCat} /> 
    </>
  );
}