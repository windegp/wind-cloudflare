"use client";
import { useState } from 'react';
import Papa from 'papaparse';
import { getDb } from "@/lib/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore/lite";

export const dynamic = 'force-dynamic';

export default function ImportShopifyCSV() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const processAndUpload = () => {
    if (!file) return alert("اختر ملف الـ CSV أولاً!");
    setLoading(true);
    setLog([]); // تصفير السجل
    addLog("جاري بدء عملية الاستيراد بنظام WIND الجديد...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        addLog(`تم العثور على ${rows.length} سطر في الملف.`);
        
        const productsMap = {};

        rows.forEach(row => {
          const handle = row['Handle'];
          if (!handle) return;

          // لو المنتج مش موجود في الخريطة، ننشئه لأول مرة
          if (!productsMap[handle]) {
            
            // --- تجميع كل التصنيفات (Collections) في مصفوفة واحدة ---
            const collectionSet = new Set();
            
            // 1. إضافة النوع (مثل: Knitwear)
            if (row['Type']) collectionSet.add(row['Type'].trim());
            
            // 2. إضافة التصنيف العام (Category)
            if (row['Product Category']) collectionSet.add(row['Product Category'].trim());
            
            // 3. إضافة الـ Tags (مثل: sale, best-seller, summer)
            if (row['Tags']) {
              row['Tags'].split(',').forEach(tag => {
                const trimmedTag = tag.trim();
                if (trimmedTag) collectionSet.add(trimmedTag);
              });
            }

            productsMap[handle] = {
              title: row['Title'] || "",
              description: row['Body (HTML)'] || "",
              vendor: row['Vendor'] || "WIND",
              type: row['Type'] || "",
              tags: row['Tags'] || "",
              // 🔥 هذه المصفوفة هي التي ستتحكم في ظهور المنتج في الأقسام والمنيو
              collections: Array.from(collectionSet), 
              status: row['Published'] === 'TRUE' || row['Published'] === 'true' ? 'Active' : 'Draft',
              price: row['Variant Price'] || "0",
              compareAtPrice: row['Variant Compare At Price'] || "",
              images: [],
              variants: [],
              seo: {
                handle: handle,
                title: row['SEO Title'] || "",
                description: row['SEO Description'] || ""
              },
              metafields: {
                isdalBundle: row['isdal bundle list (product.metafields.custom.isdal_bundle_list)'] || "",
                sizeChart: row['Product Size Chart (product.metafields.custom.product_size_chart)'] || "",
                suggested: row['Suggested Products (product.metafields.custom.suggested_products)'] || "",
                youMayAlsoLike: row['You May Also Like (product.metafields.custom.you_may_also_like)'] || "",
                fabric: row['Fabric (shopify.fabric)'] || "",
                fit: row['Fit (shopify.fit)'] || ""
              },
              createdAt: serverTimestamp()
            };
          }

          // تجميع الصور (مع تجنب التكرار)
          if (row['Image Src'] && !productsMap[handle].images.includes(row['Image Src'])) {
            productsMap[handle].images.push(row['Image Src']);
          }

          // تجميع البدائل (الألوان والمقاسات)
          if (row['Option1 Value'] || row['Variant SKU']) {
            productsMap[handle].variants.push({
              option1Name: row['Option1 Name'] || "",
              option1Value: row['Option1 Value'] || "",
              option2Name: row['Option2 Name'] || "",
              option2Value: row['Option2 Value'] || "",
              price: row['Variant Price'] || "",
              compareAtPrice: row['Variant Compare At Price'] || "",
              sku: row['Variant SKU'] || "",
              quantity: parseInt(row['Variant Inventory Qty']) || 0,
            });
          }
        });

        const productsArray = Object.values(productsMap);
        addLog(`تم دمج البيانات في ${productsArray.length} منتج فريد.`);
        addLog("بدأ الرفع إلى Firebase... يرجى عدم إغلاق الصفحة.");

        let successCount = 0;
        let errorCount = 0;

        for (const product of productsArray) {
          try {
            // نستخدم الـ handle كـ ID للمنتج لسهولة البحث والروابط
            const db = getDb();
            const productRef = doc(collection(db, "products"), product.seo.handle);
            await setDoc(productRef, product);
            successCount++;
            if (successCount % 10 === 0) addLog(`تم رفع ${successCount} منتج بنجاح...`);
          } catch (error) {
            console.error("Firebase Upload Error:", error);
            errorCount++;
          }
        }

        // 🔥 مسح كاش الموقع بالكامل بعد انتهاء الاستيراد
        try {
          addLog("جاري مسح كاش السيرفر لتحديث الموقع...");
          const revalidateRes = await fetch('/api/revalidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET, 
              type: 'all' 
            })
          });
          
          if (!revalidateRes.ok) {
            const errData = await revalidateRes.json();
            console.error("WIND Cache Warning:", errData);
            addLog("⚠️ تحذير: لم يتم مسح الكاش تلقائياً.");
          } else {
            addLog("✅ تم مسح الكاش وتحديث الموقع بنجاح.");
          }
        } catch (e) {
          console.error("Cache Revalidate Network Error:", e);
          addLog("⚠️ خطأ في الاتصال أثناء مسح الكاش.");
        }

        addLog(`✅ اكتملت المهمة بنجاح!`);
        addLog(`نجح الرفع: ${successCount}`);
        if (errorCount > 0) addLog(`فشل الرفع: ${errorCount}`);
        setLoading(false);
      },
      error: (error) => {
        addLog(`❌ خطأ فادح في قراءة الملف: ${error.message}`);
        setLoading(false);
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 text-right" dir="rtl">
      <h1 className="text-3xl font-black text-white mb-6 border-r-8 border-[#F5C518] pr-4">
        WIND <span className="text-[#F5C518]">IMPORTER</span>
      </h1>
      
      <div className="bg-[#1a1a1a] border border-[#333] p-8 rounded-2xl shadow-2xl">
        <div className="mb-8">
          <h3 className="text-lg font-bold text-white mb-2">استيراد منتجات Shopify</h3>
          <p className="text-gray-500 text-sm leading-relaxed">
            هذا النظام يقوم أوتوماتيكياً بتحويل <span className="text-white italic">Tags</span> و <span className="text-white italic">Type</span> إلى مصفوفة كولكشنات ذكية، مما يسمح للمنتج بالظهور في أقسام متعددة (مثل التخفيضات والأكثر مبيعاً) في وقت واحد.
          </p>
        </div>

        <div className="relative border-2 border-dashed border-[#444] rounded-xl p-10 text-center hover:border-[#F5C518] transition-colors cursor-pointer bg-[#121212] group">
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
          />
          <div className="space-y-4">
            <div className="text-4xl">📄</div>
            <p className="text-gray-400 group-hover:text-white transition">
              {file ? `الملف المختار: ${file.name}` : "اسحب ملف الـ CSV هنا أو اضغط للاختيار"}
            </p>
          </div>
        </div>

        <button 
          onClick={processAndUpload}
          disabled={loading || !file}
          className={`w-full mt-8 py-4 rounded-xl font-black text-lg transition-all transform active:scale-95 ${loading || !file ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#F5C518] text-black hover:bg-white shadow-[0_0_30px_rgba(245,197,24,0.2)]'}`}
        >
          {loading ? 'جاري الرفع الآن...' : 'ابدأ الاستيراد الذكي 🚀'}
        </button>
      </div>

      {log.length > 0 && (
        <div className="mt-10 bg-black border border-[#333] rounded-xl p-6 font-mono text-sm text-left shadow-inner" dir="ltr">
          <h3 className="text-white mb-4 border-b border-[#333] pb-2 font-bold tracking-widest text-xs uppercase">System Terminal Output</h3>
          <div className="h-64 overflow-y-auto space-y-2 custom-scrollbar pr-2">
            {log.map((msg, i) => (
              <div key={i} className={`${msg.includes('✅') ? 'text-green-400 font-bold' : msg.includes('❌') ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                <span className="text-gray-700 mr-2">[{new Date().toLocaleTimeString()}]</span>
                {'>'} {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #000; }
        .custom-scrollbar::-webkit-scrollbar- Schuh { background: #F5C518; border-radius: 10px; }
      `}</style>
    </div>
  );
}