// app/product/[id]/page.js
import { getDb } from "@/lib/firebase"; 
import { getFirebaseEdge, getEdgeDb } from "@/lib/firebase-edge";
import { doc, getDoc } from "firebase/firestore/lite";
import { products as staticProducts } from "@/lib/products";
import ProductView from "./ProductView"; 
import { cache } from 'react'; // إضافة الكاش لتوفير الكوتا 

// Use edge-compatible Firebase when running on edge runtime
const isEdgeRuntime = typeof window === 'undefined' && process.env.NEXT_RUNTIME === 'edge';
const firestoreDb = isEdgeRuntime ? getEdgeDb() : getDb(); 

// تم تغليف الدالة بـ cache لضمان جلب المنتج مرة واحدة فقط لكل طلب سيرفر (توفير كوتا)
const getProductData = cache(async (id) => {
  const staticProduct = staticProducts.find((p) => p.id.toString() === id.toString());
  if (staticProduct) return staticProduct;

  try {
    const docRef = doc(firestoreDb, "products", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate().toISOString();
      }
      if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        data.updatedAt = data.updatedAt.toDate().toISOString();
      }
      
      return { id: docSnap.id, ...data };
    }
  } catch (error) {
    console.error("Error fetching product:", error);
  }
  return null;
});

// 1. الجزء الخاص بـ Metadata
export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await getProductData(id);

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
    // 👇 التعديل الجديد: سحب التاجات ككلمات مفتاحية لجوجل
    keywords: product.tags ? product.tags.split(',').map(tag => tag.trim()) : [],
    openGraph: {
      title: finalTitle,
      description: finalDescription,
      url: `https://windeg.com/product/${id}`,
      siteName: 'WIND',
      images: [{ url: product.images?.[0] || product.mainImage || "" }],
      type: 'article',
    },
  };
}

// 2. الصفحة الرئيسية
export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const sourceCat = (await searchParams)?.cat;
  const product = await getProductData(id);

  if (!product) return null; // Silent fallback

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
      // 👇 التعديل الجديد: استخدام الفيندور واسم البراند
      "name": product.vendor || "WIND"
    },
    "offers": {
      "@type": "Offer",
      "url": `https://windeg.com/product/${id}`,
      "priceCurrency": "EGP",
      "price": product.price || "0",
      "availability": (Number(product.quantity) > 0 || product.sellOutOfStock === "Yes") ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition"
    }
  };

  // تأمين أخير لضمان تمرير داتا نظيفة للواجهة
  const sanitizedProduct = JSON.parse(JSON.stringify(product));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductView initialProduct={sanitizedProduct} sourceCategory={sourceCat} /> 
    </>
  );
}