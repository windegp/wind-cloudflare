"use client";
import React, { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from "firebase/firestore/lite";
// 🔥 1. استيراد SWR السحري
import useSWR, { mutate } from 'swr';

export const dynamic = 'force-dynamic';

// 🔥 2. دوال الجلب المعزولة لـ SWR
const fetchHomeConfig = async () => {
  const db = getDb();
  const layoutRef = doc(db, "homepage", "layout_config");
  const layoutSnap = await getDoc(layoutRef);
  
  const heroRef = doc(db, "homepage", "main-hero");
  const heroSnap = await getDoc(heroRef);

  return {
    layout: layoutSnap.exists() ? layoutSnap.data() : { sections: [] },
    hero: heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] }
  };
};

const fetchPickerData = async () => {
  const db = getDb();
  let products = [];
  let collections = [];
  
  try {
    const productsRef = collection(db, "products"); 
    // 🔥 صمام أمان موحد (500) - توازن بين إظهار كل المنتجات وضمان الأداء
    const productsQuery = query(productsRef, limit(500)); 
    const productsSnap = await getDocs(productsQuery);
    products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const collectionsRef = collection(db, "collections"); 
    // 🔥 صمام أمان موحد (500) - توازن بين إظهار كل الأقسام وضمان الأداء
    const collectionsQuery = query(collectionsRef, limit(500));
    const collectionsSnap = await getDocs(collectionsQuery);
    collections = collectionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) { 
    console.error("WIND Quota Guard: Picker data fetched with limits.", err); 
  }
  
  return { products, collections };
};

// ============================================================================
// خريطة الأقسام 
// ============================================================================
const SECTION_TYPES = {
  HERO_SECTION: { label: "الهيرو الرئيسي", designId: "MODERN_SLIDER" },
  
  FEATURED_SECTION: { 
    label: "المميز (Featured Today)", designId: "IMDB_STYLE", 
    hasTitle: true, hasSubTitle: true, hasViewAllLink: true,
    hasProducts: true, hasCollections: true, 
    outputArray: 'cards' 
  },
  
  TOP_TEN_SECTION: { 
    label: "أفضل 10 منتجات", designId: "TOP_TEN_LIST", 
    hasTitle: true, hasViewAllLink: true,
    hasProducts: true, hasCollections: false, 
    outputArray: 'cards'
  },
  
  MARQUEE_SECTION: { 
    label: "شريط المنتجات المتحرك", designId: "PRODUCTS_SLIDER", 
    hasTitle: true, hasSubTitle: true,
    hasProducts: true, hasCollections: true, 
    outputArray: 'products' 
  },
  
  BEST_SELLERS_SECTION: { 
    label: "الأكثر مبيعاً (شبكة منتجات)", designId: "BEST_SELLERS_GRID", 
    hasTitle: true, hasSubTitle: true, hasViewAllLink: true,
    hasProducts: true, hasCollections: true, 
    outputArray: 'products'
  },

  EXCLUSIVE_OFFERS_SECTION: { 
    label: "العروض الحصرية (كروت فاخرة)", designId: "PREMIUM_CARDS", 
    hasTitle: true, hasSubTitle: true, hasViewAllLink: true,
    hasProducts: true, hasCollections: true, 
    outputArray: 'products'
  },

  COLLECTIONS_SPOTLIGHT: { 
    label: "أبرز المجموعات (بوسترات تصنيف)", designId: "POSTER_COLLECTIONS", 
    hasTitle: true, hasSubTitle: true, hasViewAllLink: true,
    hasProducts: false, hasCollections: true, 
    outputArray: 'collections'
  },

  CIRCULAR_COLLECTIONS: { 
    label: "المجموعات الدائرية (Season Collection)", designId: "CIRCULAR_COLLECTIONS_DESIGN", 
    hasTitle: true, hasSubTitle: true, hasViewAllLink: true,
    hasProducts: false, hasCollections: true, 
    outputArray: 'collections' 
  },

  TABBED_HIGHLIGHTS_SECTION: { 
    label: "المنتجات المبوبة (3 تبويبات)", 
    designId: "TABBED_TABS_DESIGN", 
    hasTitle: true, hasSubTitle: false, hasViewAllLink: true,
    hasProducts: true, hasCollections: false, 
    isTabbed: true, 
    tabsConfig: ["Hot items", "Best sellers", "New arrivals"],
    outputArray: 'tabbedProducts' 
  },
  
  BANNER_PRODUCT_GRID_SECTION: { 
    label: "قسم المجلات (غلاف + منتجات)", 
    designId: "BANNER_EDITORIAL_DESIGN", 
    hasTitle: false, hasSubTitle: false, hasViewAllLink: false,
    hasProducts: true, hasCollections: false, 
    hasBannerConfig: true, 
    outputArray: 'products' 
  },

  VISUAL_BREAK_SECTION: { 
    label: "الفاصل المرئي (خلفية داكنة + صورة)", 
    designId: "DARK_PROMO_DESIGN", 
    hasTitle: false, hasSubTitle: false, hasViewAllLink: false,
    hasProducts: false, hasCollections: false, 
    hasVisualBreakConfig: true, 
    outputArray: 'none' 
  },

  TOP_RATED_WEEKLY_SECTION: { label: "الأعلى تقييماً هذا الأسبوع", designId: "DYNAMIC_RATING_GRID", hasTitle: true, hasSubTitle: true, hasViewAllLink: true, isDynamicAuto: true },
  MOST_LIKED_WEEKLY_SECTION: { label: "الأكثر إعجاباً هذا الأسبوع", designId: "DYNAMIC_LIKES_GRID", hasTitle: true, hasSubTitle: true, hasViewAllLink: true, isDynamicAuto: true },
  TOP_RATED_ALL_TIME_SECTION: { label: "أساطير التقييمات (العموم)", designId: "DYNAMIC_RATING_GRID_ALL_TIME", hasTitle: true, hasSubTitle: true, hasViewAllLink: true, isDynamicAuto: true },
  MOST_LIKED_ALL_TIME_SECTION: { label: "القطع الأكثر طلباً وحباً (العموم)", designId: "PREMIUM_GRID_ALL_TIME", hasTitle: true, hasSubTitle: true, hasViewAllLink: true, isDynamicAuto: true },
  
  CUSTOMER_REVIEWS_SECTION: { 
    label: "تقييمات العملاء (ديناميكي)", 
    designId: "CUSTOMER_REVIEWS_DESIGN", 
    hasTitle: true, 
    hasBottomText: true, 
    hasSubTitle: false, 
    hasViewAllLink: false, 
    isDynamicAuto: true 
  },

  // 🔥 القسم الجديد: الفكرة العائمة + كروت المجموعات
  FLOATING_COLLECTIONS_SECTION: {
    label: "الفكرة العائمة + كروت المجموعات (الجديد)",
    designId: "FLOATING_COLLECTIONS_DESIGN",
    hasTitle: false, 
    hasFloatingConfig: true, // تفعيل إعدادات القسم الجديد
    hasProducts: true,
    hasCollections: true,
    outputArray: 'cards' // يستخدم نظام الكروت لدعم تخصيص كل شيء
  }
};

export default function HomeManagerPage() {
  const [activeTab, setActiveTab] = useState('layout');
  const [slides, setSlides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [layoutSections, setLayoutSections] = useState([]);
  
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedPickers, setExpandedPickers] = useState({});
  const [expandedOverrides, setExpandedOverrides] = useState({});
  
  const [saving, setSaving] = useState(false);
  // متغير للتحكم في تهيئة البيانات مرة واحدة فقط من الـ Cache إلى الـ State
  const [isInitialized, setIsInitialized] = useState(false);

  // 🔥 3. السحب الموازي عبر SWR (سحب إعدادات الصفحة وسحب المنتجات للقوائم)
  const { data: configData, isLoading: isConfigLoading } = useSWR('home-config', fetchHomeConfig);
  const { data: pickerData, isLoading: isPickerLoading } = useSWR('home-pickers', fetchPickerData);

  // المتغيرات الجاهزة للاستخدام في قوائم الاختيار (Fallback لمصفوفات فارغة)
  const allStoreProducts = pickerData?.products || [];
  const allStoreCollections = pickerData?.collections || [];
  const loading = isConfigLoading || isPickerLoading || !isInitialized;

  // 🔥 4. تهيئة الـ State المحلية بمجرد وصول داتا SWR (مرة واحدة فقط)
  useEffect(() => {
    if (configData && !isInitialized) {
      const loadedSections = configData.layout.sections || [];
      const parsedSections = loadedSections.map(sec => {
        let adminItems = sec.data._adminItems;
        if (!adminItems) {
           adminItems = [];
           if (sec.data.cards) {
              adminItems = sec.data.cards.map((c, i) => ({
                 itemId: c.productId || `legacy-p-${Math.random()}`, itemType: 'product',
                 originalName: c.mainTitle || "", originalImage: c.image || "",
                 customName: c.mainTitle || "", customImage: c.image || "",
                 originalPrice: c.price || "", customPrice: c.price || "",
                 compareAtPrice: c.compareAtPrice || "",
                 linkUrl: c.linkUrl || "", badge: c.badge || "", badgeType: c.badgeType || "none",
                 linkText: c.linkText || "", subCards: c.subCards || [],
                 customRating: c.rating || "", customReviews: c.reviewsCount || "", customCategory: c.category || ""
              }));
           } else if (sec.data.products) {
              adminItems = sec.data.products.map(p => ({
                 itemId: p.productId || `legacy-p-${Math.random()}`, itemType: 'product',
                 originalName: p.name || "", originalImage: p.image || "",
                 customName: p.name || "", customImage: p.image || "",
                 originalPrice: p.price || "", customPrice: p.price || "",
                 compareAtPrice: p.compareAtPrice || "",
                 linkUrl: p.linkUrl || "", badge: p.badge || ""
              }));
           } else if (sec.data.collections || sec.data.linkedCollections) {
              const cols = sec.data.linkedCollections || sec.data.collections;
              adminItems = cols.map(c => ({
                 itemId: c.collectionId || c.id || c.slug || `legacy-c-${Math.random()}`, itemType: 'collection',
                 originalName: c.name || c.customName || "", originalImage: c.image || "",
                 customName: c.customName || c.name || "", customImage: c.image || "",
                 linkUrl: c.linkUrl || "", customDescription: c.description || ""
              }));
           }
        }
        return { ...sec, data: { ...sec.data, _adminItems: adminItems } };
      });
      
      setLayoutSections(parsedSections);

      if (configData.hero.slides && configData.hero.slides.length > 0) {
        setSlides(configData.hero.slides);
        setCategories(configData.hero.categories || []);
      } else {
        setSlides([{ image: "", tag: "", title: "", desc: "", thumbnail: "", productLink: "", buttonText: "" }]);
        setCategories([{ title: "", link: "" }]);
      }
      
      setIsInitialized(true); // منع إعادة التهيئة عند تغيير التابات
    }
  }, [configData, isInitialized]);

  const handleLayoutCategoryChange = (index, newCategory) => {
    const updated = [...layoutSections];
    const config = SECTION_TYPES[newCategory];
    updated[index].category = newCategory;
    updated[index].designId = config?.designId || "";
    
    updated[index].data = { 
      title: config?.hasTitle ? config.label : "", 
      subTitle: "", 
      viewAllLink: "", 
      tabs: config?.isTabbed ? [...config.tabsConfig] : [],
      
      topDescription: config?.hasBannerConfig ? "خطوط نظيفة تلتقي بالتفاصيل الدقيقة في هذه المجموعة، تتميز بتصميم عصري وأنيق." : "",
      bannerImage: "",
      bannerSubTitle: config?.hasBannerConfig ? "وصل حديثاً" : "",
      bannerTitle: config?.hasBannerConfig ? "تشكيلة الموسم" : "",
      buttonText: (config?.hasBannerConfig || config?.hasVisualBreakConfig) ? "تسوق الآن" : "",
      buttonLink: (config?.hasBannerConfig || config?.hasVisualBreakConfig) ? "/collections/all" : "",
      
      promoTitle: config?.hasVisualBreakConfig ? "تصميمات تخطف الأنظار" : "",
      promoSubTitle: config?.hasVisualBreakConfig ? "اكتشفي الجديد" : "",
      promoDescription: config?.hasVisualBreakConfig ? "نسقي قطعك المفضلة للحصول على إطلالة عصرية ومريحة تناسب كل أوقاتك." : "",
      promoImage: "",
      
      bottomText: config?.hasBottomText ? "تقييم حقيقي" : "",

      // 🔥 إعدادات القسم العائم الجديد
      floatingTitle: config?.hasFloatingConfig ? "Fashion with a focus on green materials, ethical manufacturing and less-waste." : "",
      floatingSubTitle: config?.hasFloatingConfig ? "The product idea" : "",
      floatingBtnText: config?.hasFloatingConfig ? "View All Collection" : "",
      floatingBtnLink: config?.hasFloatingConfig ? "/collections/all" : "",
      floatImg1: config?.hasFloatingConfig ? "" : "",
      floatImg2: config?.hasFloatingConfig ? "" : "",
      floatImg3: config?.hasFloatingConfig ? "" : "",

      _adminItems: [] 
    };
    setLayoutSections(updated);
  };

  const handleLayoutDataChange = (index, field, value) => {
    const updated = [...layoutSections];
    updated[index].data[field] = value;
    setLayoutSections(updated);
  };

  const toggleItemSelection = (sectionIndex, item, type, tabIndex = null) => {
    const updated = [...layoutSections];
    let items = updated[sectionIndex].data._adminItems || [];
    
    const isTabbed = SECTION_TYPES[updated[sectionIndex].category]?.isTabbed;
    const existsIndex = items.findIndex(i => i.itemId === item.id && (!isTabbed || i.tabIndex === tabIndex));
    
    if (existsIndex >= 0) {
      items.splice(existsIndex, 1);
    } else {
      items.push({
        itemId: item.id,
        itemType: type,
        originalName: item.title || item.name || "",
        originalImage: (item.images && item.images[0]) || item.image || "",
        originalPrice: item.price || "",
        originalCategory: item.category || "",
        customName: "", customImage: "", badge: "",
        linkUrl: type === 'product' ? `/products/${item.id}` : `/collections/${item.slug || item.id}`,
        badgeType: "none", linkText: "", subCards: [],
        customPrice: "", compareAtPrice: item.compareAtPrice || "", customRating: "", customReviews: "", customCategory: "",
        customDescription: "",
        tabIndex: isTabbed ? tabIndex : null
      });
    }
    updated[sectionIndex].data._adminItems = items;
    setLayoutSections(updated);
  };

  const handleOverrideChange = (sectionIndex, itemIndex, field, value) => {
    const updated = [...layoutSections];
    updated[sectionIndex].data._adminItems[itemIndex][field] = value;
    setLayoutSections(updated);
  };

  const addNewSection = () => {
    setLayoutSections([...layoutSections, { category: "FEATURED_SECTION", designId: "IMDB_STYLE", data: { title: "المميز اليوم", subTitle: "", _adminItems: [] } }]);
    setExpandedSections(prev => ({ ...prev, [layoutSections.length]: true }));
  };

  const removeSection = (index) => setLayoutSections(layoutSections.filter((_, i) => i !== index));
  const moveSection = (index, dir) => {
    const u = [...layoutSections];
    const n = dir === 'up' ? index - 1 : index + 1;
    if (n >= 0 && n < u.length) { [u[index], u[n]] = [u[n], u[index]]; setLayoutSections(u); }
  };

  const toggleAccordion = (index) => setExpandedSections(p => ({ ...p, [index]: !p[index] }));
  const togglePicker = (idx, type) => setExpandedPickers(p => ({ ...p, [`${idx}-${type}`]: !p[`${idx}-${type}`] }));
  const toggleOverride = (sIdx, iIdx) => setExpandedOverrides(p => ({ ...p, [`${sIdx}-${iIdx}`]: !p[`${sIdx}-${iIdx}`] }));

  const handleSlideChange = (i, f, v) => { const u = [...slides]; u[i][f] = v; setSlides(u); };
  const addNewSlide = () => setSlides([...slides, { image: "", tag: "", title: "", desc: "", thumbnail: "", productLink: "", buttonText: "" }]);
  const removeSlide = (i) => setSlides(slides.filter((_, idx) => idx !== i));
  const handleCategoryChange = (i, f, v) => { const u = [...categories]; u[i][f] = v; setCategories(u); };
  const addNewCategory = () => setCategories([...categories, { title: "", link: "" }]);
  const removeCategory = (i) => setCategories(categories.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    try {
      const db = getDb();
      const payloadSections = layoutSections.map(sec => {
        const config = SECTION_TYPES[sec.category];
        const items = sec.data._adminItems || [];
        
        const payloadData = { 
          title: sec.data.title || "", 
          subTitle: sec.data.subTitle || "", 
          viewAllLink: sec.data.viewAllLink || "",
          tabs: sec.data.tabs || [],
          
          topDescription: sec.data.topDescription || "",
          bannerImage: sec.data.bannerImage || "",
          bannerSubTitle: sec.data.bannerSubTitle || "",
          bannerTitle: sec.data.bannerTitle || "",
          buttonText: sec.data.buttonText || "",
          buttonLink: sec.data.buttonLink || "",

          promoTitle: sec.data.promoTitle || "",
          promoSubTitle: sec.data.promoSubTitle || "",
          promoDescription: sec.data.promoDescription || "",
          promoImage: sec.data.promoImage || "",

          bottomText: sec.data.bottomText || "",

          // 🔥 حفظ الإعدادات العائمة
          floatingTitle: sec.data.floatingTitle || "",
          floatingSubTitle: sec.data.floatingSubTitle || "",
          floatingBtnText: sec.data.floatingBtnText || "",
          floatingBtnLink: sec.data.floatingBtnLink || "",
          floatImg1: sec.data.floatImg1 || "",
          floatImg2: sec.data.floatImg2 || "",
          floatImg3: sec.data.floatImg3 || "",

          _adminItems: items
        };

        if (!config.isDynamicAuto) {
          if (config.outputArray === 'cards') {
            payloadData.cards = items.map(item => ({
              image: item.customImage || item.originalImage || "",
              mainTitle: item.customName || item.originalName || "",
              linkUrl: item.linkUrl || "",
              badge: item.badge || "",
              badgeType: item.badgeType || "none",
              linkText: item.linkText || "",
              subCards: item.subCards || [],
              price: item.customPrice || item.originalPrice || "",
              compareAtPrice: item.compareAtPrice || "", 
              rating: item.customRating || "",
              reviewsCount: item.customReviews || "",
              category: item.customCategory || item.originalCategory || ""
            }));
          } else if (config.outputArray === 'products') {
            payloadData.products = items.map(item => ({
              productId: item.itemId,
              name: item.customName || item.originalName || "",
              image: item.customImage || item.originalImage || "",
              price: item.customPrice || item.originalPrice || "",
              compareAtPrice: item.compareAtPrice || "", 
              linkUrl: item.linkUrl || "",
              badge: item.badge || ""
            }));
          } else if (config.outputArray === 'tabbedProducts') {
            const tab0 = items.filter(i => i.tabIndex === 0);
            const tab1 = items.filter(i => i.tabIndex === 1);
            const tab2 = items.filter(i => i.tabIndex === 2);
            const orderedItems = [...tab0, ...tab1, ...tab2];
            
            payloadData.products = orderedItems.map(item => ({
              productId: item.itemId,
              name: item.customName || item.originalName || "",
              image: item.customImage || item.originalImage || "",
              price: item.customPrice || item.originalPrice || "",
              compareAtPrice: item.compareAtPrice || "",
              linkUrl: item.linkUrl || "",
              category: item.customCategory || item.originalCategory || "",
              tabIndex: item.tabIndex 
            }));
            payloadData.chunkSizes = [tab0.length, tab1.length, tab2.length];
          } else if (config.outputArray === 'collections') {
            payloadData.linkedCollections = items.map(item => ({
              id: item.itemId,
              slug: item.itemId,
              name: item.originalName || "",
              customName: item.customName || "",
              image: item.customImage || item.originalImage || "",
              linkUrl: item.linkUrl || "",
              description: item.customDescription || "",
              badge: item.badge || ""
            }));
          }
        }
        
        return { category: sec.category, designId: sec.designId, data: payloadData };
      });

      await setDoc(doc(db, "homepage", "layout_config"), { sections: payloadSections });
      await setDoc(doc(db, "homepage", "main-hero"), { slides, categories });
      
      //  update SWR cache after save
      mutate('home-config');
      
      //  Clear KV cache so visitors see updates
      try {
        const revalidateResponse = await fetch('/api/revalidate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET,
            keys: ['homepage_data_v1']
          })
        });
        
        if (revalidateResponse.ok) {
          console.log('KV cache cleared successfully');
        } else {
          console.error('Failed to clear KV cache');
        }
      } catch (revalidateError) {
        console.error('Revalidate API error:', revalidateError);
      }
      
      alert("تم حفظ التحديثات بنجاح! راجع الصفحة الرئيسية الآن.");
    } catch (error) {
      console.error(error); alert("حدث خطأ أثناء الحفظ.");
    } finally { setSaving(false); }
  };

  if (loading) return ( <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#202223]"></div></div> );

  const heroSectionIndex = layoutSections.findIndex(s => s.category === 'HERO_SECTION');
  const currentHeroDesignId = heroSectionIndex >= 0 ? layoutSections[heroSectionIndex].designId : 'MODERN_SLIDER';

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#202223] font-sans pb-24" dir="rtl">
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm px-4 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-xl lg:text-2xl font-bold">إدارة الصفحة الرئيسية</h1><p className="text-gray-500 text-xs mt-1">النظام الموحد الذكي (متوافق مع التصميمات القديمة 100%)</p></div>
        <button onClick={handleSave} disabled={saving} className={`px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 ${saving ? 'bg-gray-100 text-gray-400' : 'bg-[#1a1a1a] hover:bg-black text-white'}`}>
          {saving ? 'جاري الحفظ...' : 'حفظ ونشر التعديلات'}
        </button>
      </div>

      <div className="max-w-5xl mx-auto mt-6 px-4">
        <div className="flex overflow-x-auto scrollbar-hide bg-white border border-gray-200 rounded-xl shadow-sm mb-6 p-1">
          <button onClick={() => setActiveTab('layout')} className={`flex-1 min-w-[140px] py-2.5 px-4 text-sm font-bold rounded-lg ${activeTab === 'layout' ? 'bg-gray-100' : 'text-gray-500'}`}>1. هيكلة وترتيب الصفحة</button>
          <button onClick={() => setActiveTab('hero')} className={`flex-1 min-w-[140px] py-2.5 px-4 text-sm font-bold rounded-lg ${activeTab === 'hero' ? 'bg-gray-100' : 'text-gray-500'}`}>2. محتوى الهيرو</button>
          <button onClick={() => setActiveTab('featured')} className={`flex-1 min-w-[140px] py-2.5 px-4 text-sm font-bold rounded-lg ${activeTab === 'featured' ? 'bg-gray-100' : 'text-gray-500'}`}>3. محتوى الأقسام والكروت</button>
        </div>

        {activeTab === 'layout' && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            {layoutSections.map((section, index) => (
              <div key={index} className="flex gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="flex flex-col gap-1 border-l border-gray-100 pl-3">
                  <button onClick={() => moveSection(index, 'up')} className="bg-gray-50 p-2 rounded-lg text-gray-500 hover:bg-gray-100">▲</button>
                  <button onClick={() => moveSection(index, 'down')} className="bg-gray-50 p-2 rounded-lg text-gray-500 hover:bg-gray-100">▼</button>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1.5">نوع القسم</label>
                    <select value={section.category} onChange={(e) => handleLayoutCategoryChange(index, e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none">
                      {Object.keys(SECTION_TYPES).map(key => <option key={key} value={key}>{SECTION_TYPES[key].label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1.5">التصميم المرتبط</label>
                    <input type="text" value={section.designId} readOnly className="w-full p-2.5 border bg-gray-50 rounded-lg text-sm text-gray-500 font-mono" dir="ltr" />
                  </div>
                </div>
                <button onClick={() => removeSection(index)} className="bg-red-50 text-red-600 px-4 rounded-lg font-bold text-sm">حذف</button>
              </div>
            ))}
            <button onClick={addNewSection} className="w-full py-3.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl font-bold bg-white text-sm">+ إضافة قسم جديد</button>
          </div>
        )}

        {activeTab === 'hero' && (
          <div className="space-y-8 animate-[fadeIn_0.2s_ease-out]">
            
            {heroSectionIndex >= 0 && (
              <div className="bg-white border rounded-xl p-5 shadow-sm border-[#1A1A1A]/20">
                <h2 className="text-base font-bold mb-4 text-[#1A1A1A]">اختيار تصميم الهيرو</h2>
                <select 
                  value={currentHeroDesignId} 
                  onChange={(e) => {
                    const u = [...layoutSections];
                    u[heroSectionIndex].designId = e.target.value;
                    setLayoutSections(u);
                  }} 
                  className="w-full md:w-1/2 p-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#C2A581] font-bold"
                >
                  <option value="MODERN_SLIDER">الهيرو الكلاسيكي (سلايدر كامل الشاشة)</option>
                  <option value="EDITORIAL_CENTERED">الهيرو المينيماليست المتمركز (المطابق للمرجع)</option>
                </select>
              </div>
            )}

            <div className="space-y-6">
              {slides.map((slide, index) => (
                <div key={index} className="p-5 border border-gray-200 rounded-xl bg-white shadow-sm hover:border-[#1A1A1A]/30 transition-colors">
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                    <h3 className="font-bold text-sm text-[#202223]">الشريحة رقم {index + 1}</h3>
                    <button onClick={() => removeSlide(index)} className="text-red-500 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100">حذف الشريحة</button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label className="block text-xs font-bold mb-1.5">رابط الصورة (الرئيسية)</label><input type="text" value={slide.image} onChange={(e) => handleSlideChange(index, 'image', e.target.value)} className="w-full p-2.5 border rounded-lg font-mono text-sm outline-none focus:border-[#1A1A1A]" dir="ltr" /></div>
                    
                    <div><label className="block text-xs font-bold mb-1.5 text-gray-600">العنوان الصغير (Tag)</label><input type="text" value={slide.tag} onChange={(e) => handleSlideChange(index, 'tag', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="LIMITED EDITION" /></div>
                    <div><label className="block text-xs font-bold mb-1.5 text-gray-600">النص الرئيسي العريض</label><input type="text" value={slide.title} onChange={(e) => handleSlideChange(index, 'title', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="WINTER COLLECTION" /></div>
                    <div><label className="block text-xs font-bold mb-1.5 text-gray-600">نص الزر</label><input type="text" value={slide.buttonText} onChange={(e) => handleSlideChange(index, 'buttonText', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="SHOP NOW" /></div>
                    <div><label className="block text-xs font-bold mb-1.5 text-blue-600">رابط الزر (URL)</label><input type="text" value={slide.productLink} onChange={(e) => handleSlideChange(index, 'productLink', e.target.value)} className="w-full p-2.5 border border-blue-200 rounded-lg font-mono text-sm outline-none focus:border-blue-400" dir="ltr" /></div>

                    {currentHeroDesignId === 'MODERN_SLIDER' && (
                      <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border">
                        <div className="col-span-2"><label className="block text-xs font-bold mb-1.5 text-gray-600">الوصف الطويل (يظهر في الهيرو القديم فقط)</label><textarea value={slide.desc} onChange={(e) => handleSlideChange(index, 'desc', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none focus:border-[#1A1A1A]" rows="2" /></div>
                        <div><label className="block text-[11px] font-bold mb-1.5">رابط البوستر المصغر (للهيرو القديم)</label><input type="text" value={slide.thumbnail} onChange={(e) => handleSlideChange(index, 'thumbnail', e.target.value)} className="w-full p-2 border rounded font-mono text-xs outline-none focus:border-gray-400" dir="ltr" /></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={addNewSlide} className="w-full py-3.5 border-dashed border-2 border-gray-300 text-gray-500 font-bold rounded-xl hover:bg-white transition-colors">+ إضافة شريحة</button>
            </div>
            
            <div className="bg-white border rounded-xl p-5 shadow-sm mt-8">
              <h2 className="text-base font-bold mb-4">إدارة أزرار تصفح الأقسام (أسفل الهيرو)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categories.map((cat, index) => (
                  <div key={index} className="flex gap-2 p-2.5 border rounded-lg bg-gray-50">
                    <input type="text" value={cat.title} onChange={(e) => handleCategoryChange(index, 'title', e.target.value)} placeholder="الاسم" className="w-1/3 p-2 border rounded text-xs outline-none focus:border-[#1A1A1A]" />
                    <input type="text" value={cat.link} onChange={(e) => handleCategoryChange(index, 'link', e.target.value)} placeholder="الرابط" className="flex-1 p-2 border rounded font-mono text-xs outline-none focus:border-[#1A1A1A]" dir="ltr" />
                    <button onClick={() => removeCategory(index)} className="text-red-500 font-bold px-2 hover:bg-red-50 rounded">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={addNewCategory} className="mt-4 px-4 py-2 border rounded-lg text-xs font-bold bg-white hover:bg-gray-50">+ إضافة قسم</button>
            </div>
          </div>
        )}

        {activeTab === 'featured' && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            {layoutSections.map((section, sectionIndex) => {
              const config = SECTION_TYPES[section.category];
              if (section.category === 'HERO_SECTION') return null;
              const isExpanded = expandedSections[sectionIndex];
              const items = section.data._adminItems || [];

              return (
                <div key={sectionIndex} className="bg-white border border-gray-200 rounded-xl shadow-sm mb-3">
                  <div onClick={() => toggleAccordion(sectionIndex)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 border-b border-transparent data-[expanded=true]:border-gray-200" data-expanded={isExpanded}>
                    <div className="flex items-center gap-3">
                      <span className="bg-gray-100 font-bold text-[10px] px-2.5 py-1 rounded border">{config?.label}</span>
                      <span className="font-bold text-sm">
                        {section.category === 'VISUAL_BREAK_SECTION' ? "الفاصل المرئي" : section.data?.title || (config?.hasBannerConfig ? "قسم الغلاف" : (config?.hasFloatingConfig ? "القسم العائم" : "بدون عنوان"))}
                      </span>
                    </div>
                    <div className={`text-gray-400 font-bold transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</div>
                  </div>

                  {isExpanded && (
                    <div className="p-5 bg-gray-50">
                      
                      {/* 🔥 إعدادات القسم العائم الجديد */}
                      {config?.hasFloatingConfig && (
                        <div className="bg-white p-4 rounded-xl border border-gray-200 mb-5 space-y-4 shadow-sm">
                          <h4 className="text-sm font-bold border-b border-gray-100 pb-2 text-[#1A1A1A]">إعدادات العناوين وصور الجرافيتي (القسم العلوي)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">العنوان الصغير (أعلى)</label>
                              <input type="text" value={section.data.floatingSubTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatingSubTitle', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="مثال: The product idea" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">العنوان الرئيسي العريض</label>
                              <input type="text" value={section.data.floatingTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatingTitle', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="مثال: Fashion with a focus..." />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">نص الرابط الرئيسي</label>
                              <input type="text" value={section.data.floatingBtnText || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatingBtnText', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="View All Collection" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">عنوان الرابط (URL)</label>
                              <input type="text" value={section.data.floatingBtnLink || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatingBtnLink', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4 mt-2">
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-500">صورة كارت الجرافيتي 1 (منتصف اليسار)</label>
                              <input type="text" value={section.data.floatImg1 || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatImg1', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" placeholder="https://..." />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-500">صورة كارت الجرافيتي 2 (أعلى اليمين)</label>
                              <input type="text" value={section.data.floatImg2 || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatImg2', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" placeholder="https://..." />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-500">صورة كارت الجرافيتي 3 (أسفل اليمين)</label>
                              <input type="text" value={section.data.floatImg3 || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'floatImg3', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" placeholder="https://..." />
                            </div>
                          </div>
                        </div>
                      )}

                      {config?.hasVisualBreakConfig && (
                        <div className="bg-white p-4 rounded-xl border border-gray-200 mb-5 space-y-4 shadow-sm">
                          <h4 className="text-sm font-bold border-b border-gray-100 pb-2 text-[#1A1A1A]">إعدادات الفاصل المرئي (الخلفية الداكنة)</h4>
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">العنوان الصغير (أعلى)</label>
                              <input type="text" value={section.data.promoSubTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'promoSubTitle', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="مثال: Mix & Match" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">العنوان الرئيسي العريض</label>
                              <input type="text" value={section.data.promoTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'promoTitle', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" placeholder="مثال: Who says fashion has to be boring?" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">وصف القسم</label>
                              <textarea value={section.data.promoDescription || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'promoDescription', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" rows="2" placeholder="مثال: We love it with super long pants..." />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1.5 text-gray-700">الصورة الرئيسية للقسم</label>
                              <input type="text" value={section.data.promoImage || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'promoImage', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" placeholder="https://..." />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                              <div><label className="block text-xs font-bold mb-1.5 text-gray-700">نص الزر</label><input type="text" value={section.data.buttonText || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'buttonText', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" /></div>
                              <div><label className="block text-xs font-bold mb-1.5 text-gray-700">رابط الزر</label><input type="text" value={section.data.buttonLink || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'buttonLink', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" /></div>
                            </div>
                          </div>
                        </div>
                      )}

                      {config?.hasBannerConfig && (
                        <div className="bg-white p-4 rounded-xl border border-gray-200 mb-5 space-y-4 shadow-sm">
                          <h4 className="text-sm font-bold border-b border-gray-100 pb-2 text-[#1A1A1A]">إعدادات صورة الغلاف والمحتوى</h4>
                          <div><label className="block text-xs font-bold mb-1.5 text-gray-700">النص الوصفي أعلى الغلاف (اختياري)</label><textarea value={section.data.topDescription || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'topDescription', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" rows="2" /></div>
                          <div><label className="block text-xs font-bold mb-1.5 text-gray-700">رابط صورة الغلاف (Banner Image)</label><input type="text" value={section.data.bannerImage || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'bannerImage', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" /></div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold mb-1.5 text-gray-700">العنوان الفرعي للغلاف</label><input type="text" value={section.data.bannerSubTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'bannerSubTitle', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" /></div>
                            <div><label className="block text-xs font-bold mb-1.5 text-gray-700">العنوان الرئيسي للغلاف</label><input type="text" value={section.data.bannerTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'bannerTitle', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" /></div>
                            <div><label className="block text-xs font-bold mb-1.5 text-gray-700">نص الزر</label><input type="text" value={section.data.buttonText || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'buttonText', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A]" /></div>
                            <div><label className="block text-xs font-bold mb-1.5 text-gray-700">رابط الزر</label><input type="text" value={section.data.buttonLink || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'buttonLink', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#1A1A1A] font-mono" dir="ltr" /></div>
                          </div>
                        </div>
                      )}

                      {(config?.hasTitle || config?.hasSubTitle || config?.hasViewAllLink || config?.hasBottomText) && !config?.hasFloatingConfig && (
                        <div className="mb-5 bg-white p-4 rounded-xl border border-gray-200">
                          <div className="grid grid-cols-2 gap-4">
                            {config?.hasTitle && (
                              <div>
                                <label className="block text-xs font-bold mb-1.5">العنوان الرئيسي للقسم</label>
                                <input type="text" value={section.data?.title || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'title', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none" />
                              </div>
                            )}
                            {config?.hasBottomText && (
                              <div>
                                <label className="block text-xs font-bold mb-1.5">النص السفلي</label>
                                <input type="text" value={section.data?.bottomText || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'bottomText', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none" />
                              </div>
                            )}
                            {config?.hasSubTitle && (<div><label className="block text-xs font-bold mb-1.5">العنوان الفرعي (اختياري)</label><input type="text" value={section.data?.subTitle || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'subTitle', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm outline-none" /></div>)}
                            {config?.hasViewAllLink && (<div className="col-span-2 pt-2 border-t border-gray-100"><label className="block text-xs font-bold mb-1.5">رابط زر "عرض الكل"</label><input type="text" value={section.data?.viewAllLink || ""} onChange={(e) => handleLayoutDataChange(sectionIndex, 'viewAllLink', e.target.value)} placeholder="مثال: /collections/all" className="w-full p-2.5 border rounded-lg text-sm font-mono outline-none" dir="ltr" /></div>)}
                          </div>
                        </div>
                      )}

                      {config?.isDynamicAuto && (
                        <div className="bg-[#f4fae5] border border-[#008060]/30 p-4 rounded-xl text-center">
                          <h4 className="font-bold text-[#008060] text-sm mb-1">قسم ديناميكي بالكامل 🤖</h4>
                          <p className="text-xs text-gray-600">يسحب البيانات أوتوماتيكياً من قاعدة البيانات.</p>
                        </div>
                      )}

                      {!config?.isDynamicAuto && !config?.hasVisualBreakConfig && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {config?.hasProducts && !config?.isTabbed && (
                              <div className="relative">
                                <button onClick={() => togglePicker(sectionIndex, 'products')} className="w-full p-3 bg-white border border-[#008060]/30 rounded-lg font-bold text-sm flex justify-between items-center text-[#008060] hover:bg-[#008060]/5 transition-colors">
                                  <span>📦 تحديد منتجات جديدة</span><span>{expandedPickers[`${sectionIndex}-products`] ? '▼' : '◀'}</span>
                                </button>
                                {expandedPickers[`${sectionIndex}-products`] && (
                                  <div className="absolute z-10 w-full mt-1 max-h-[250px] overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 shadow-xl">
                                    {allStoreProducts.map(prod => {
                                      const isSelected = items.some(i => i.itemId === prod.id);
                                      return (
                                        <label key={prod.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                                          <input type="checkbox" checked={isSelected} onChange={() => toggleItemSelection(sectionIndex, prod, 'product')} className="w-4 h-4 text-[#008060] rounded focus:ring-0" />
                                          <img src={(prod.images && prod.images[0]) || prod.image || "/placeholder.jpg"} className="w-8 h-8 rounded border object-cover" />
                                          <p className="text-xs font-bold truncate">{prod.title || prod.name}</p>
                                        </label>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {config?.hasProducts && config?.isTabbed && (
                              <div className="col-span-1 md:col-span-2 space-y-4">
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                  <h4 className="text-xs font-bold text-gray-700 mb-3">تعديل أسماء التبويبات الثلاثة:</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {[0, 1, 2].map(tIdx => (
                                      <input
                                        key={tIdx}
                                        type="text"
                                        value={section.data?.tabs?.[tIdx] || ''}
                                        onChange={(e) => {
                                          const u = [...layoutSections];
                                          if (!u[sectionIndex].data.tabs) u[sectionIndex].data.tabs = ["", "", ""];
                                          u[sectionIndex].data.tabs[tIdx] = e.target.value;
                                          setLayoutSections(u);
                                        }}
                                        className="p-2 border border-gray-300 rounded outline-none focus:border-[#008060] text-xs font-bold text-center"
                                        placeholder={`اسم التبويب ${tIdx + 1}`}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-3 mt-4">
                                  {config.tabsConfig.map((defaultTabName, tIdx) => {
                                    const currentTabName = section.data?.tabs?.[tIdx] || defaultTabName;
                                    return (
                                      <div key={tIdx} className="relative">
                                        <button onClick={() => togglePicker(sectionIndex, `products-tab-${tIdx}`)} className="w-full p-3 bg-white border border-[#008060]/30 rounded-lg font-bold text-sm flex justify-between items-center text-[#008060] hover:bg-[#008060]/5 transition-colors">
                                          <span>📦 تحديد منتجات: ({currentTabName})</span><span>{expandedPickers[`${sectionIndex}-products-tab-${tIdx}`] ? '▼' : '◀'}</span>
                                        </button>
                                        {expandedPickers[`${sectionIndex}-products-tab-${tIdx}`] && (
                                          <div className="absolute z-10 w-full mt-1 max-h-[250px] overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 shadow-xl">
                                            {allStoreProducts.map(prod => {
                                              const isSelected = items.some(i => i.itemId === prod.id && i.tabIndex === tIdx);
                                              return (
                                                <label key={prod.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                                                  <input type="checkbox" checked={isSelected} onChange={() => toggleItemSelection(sectionIndex, prod, 'product', tIdx)} className="w-4 h-4 text-[#008060] rounded focus:ring-0" />
                                                  <img src={(prod.images && prod.images[0]) || prod.image || "/placeholder.jpg"} className="w-8 h-8 rounded border object-cover" />
                                                  <p className="text-xs font-bold truncate">{prod.title || prod.name}</p>
                                                </label>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {config?.hasCollections && (
                              <div className="relative">
                                <button onClick={() => togglePicker(sectionIndex, 'collections')} className="w-full p-3 bg-white border border-blue-600/30 rounded-lg font-bold text-sm flex justify-between items-center text-blue-600 hover:bg-blue-50 transition-colors">
                                  <span>📁 تحديد أقسام / كروت جديدة</span><span>{expandedPickers[`${sectionIndex}-collections`] ? '▼' : '◀'}</span>
                                </button>
                                {expandedPickers[`${sectionIndex}-collections`] && (
                                  <div className="absolute z-10 w-full mt-1 max-h-[250px] overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 shadow-xl">
                                    {allStoreCollections.map(col => {
                                      const isSelected = items.some(i => i.itemId === col.id);
                                      return (
                                        <label key={col.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                                          <input type="checkbox" checked={isSelected} onChange={() => toggleItemSelection(sectionIndex, col, 'collection')} className="w-4 h-4 text-blue-600 rounded focus:ring-0" />
                                          <p className="text-xs font-bold truncate">{col.title || col.name}</p>
                                        </label>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {items.length > 0 && (
                            <div className="mt-6 border-t border-gray-200 pt-5">
                              <h4 className="text-sm font-bold text-[#202223] mb-3">التعديلات اليدوية ({items.length}):</h4>
                              <div className="space-y-2">
                                {items.map((item, itemIndex) => {
                                  const isCardOpen = expandedOverrides[`${sectionIndex}-${itemIndex}`];
                                  const isProduct = item.itemType === 'product';
                                  
                                  return (
                                    <div key={itemIndex} className="border border-gray-200 bg-white rounded-lg shadow-sm">
                                      <button onClick={() => toggleOverride(sectionIndex, itemIndex)} className={`w-full p-3 flex justify-between items-center text-sm font-bold ${isCardOpen ? 'bg-gray-100 border-b border-gray-200' : 'hover:bg-gray-50'}`}>
                                        <span className="flex items-center gap-2">
                                          <span className={`${isProduct ? 'bg-[#1A1A1A]' : 'bg-blue-600'} text-white px-2 py-0.5 rounded text-[10px]`}>
                                            {isProduct ? '👕 منتج' : '📁 قسم'} (بطاقة {itemIndex + 1})
                                          </span> 
                                          {item.customName || item.originalName}
                                        </span>
                                        <span className="text-gray-400">{isCardOpen ? '▼' : '◀'}</span>
                                      </button>
                                      
                                      {isCardOpen && (
                                        <div className="p-4 bg-gray-50 animate-[fadeIn_0.2s_ease-out]">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                            <div>
                                              <label className="block text-[10px] font-bold text-gray-500 mb-1">اسم العرض المخصص (العنوان الرئيسي للكارت)</label>
                                              <input type="text" value={item.customName || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'customName', e.target.value)} className="w-full p-2 text-xs border rounded outline-none" placeholder={item.originalName} />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-gray-500 mb-1">تعديل الصورة الأساسية للكارت</label>
                                              <input type="text" value={item.customImage || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'customImage', e.target.value)} className="w-full p-2 text-xs border rounded outline-none font-mono" dir="ltr" placeholder="رابط صورة جديدة" />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-gray-500 mb-1">العنوان الصغير للكارت (Badge/Subtitle)</label>
                                              <input type="text" value={item.badge || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'badge', e.target.value)} className="w-full p-2 text-xs border rounded outline-none" placeholder="مثال: NEW ARRIVAL" />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-gray-500 mb-1">اسم زر الكارت (linkText)</label>
                                              <input type="text" value={item.linkText || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'linkText', e.target.value)} className="w-full p-2 text-xs border rounded outline-none" placeholder="مثال: Shop Collection" />
                                            </div>
                                            <div className="col-span-2">
                                              <label className="block text-[10px] font-bold text-gray-500 mb-1">رابط التوجيه (URL - أوتوماتيك إذا لم يكتب شيء)</label>
                                              <input type="text" value={item.linkUrl || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'linkUrl', e.target.value)} className="w-full p-2 text-xs border rounded outline-none font-mono" dir="ltr" />
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-gray-200 pt-3">
                                            {['TOP_TEN_SECTION', 'EXCLUSIVE_OFFERS_SECTION', 'MARQUEE_SECTION', 'BEST_SELLERS_SECTION', 'BANNER_PRODUCT_GRID_SECTION'].includes(section.category) && (
                                              <>
                                                <div><label className="block text-[10px] font-bold text-green-600 mb-1">السعر المخصص (الحالي)</label><input type="text" value={item.customPrice || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'customPrice', e.target.value)} className="w-full p-2 text-xs border border-green-200 bg-green-50 rounded outline-none" placeholder={item.originalPrice} /></div>
                                                <div><label className="block text-[10px] font-bold text-red-500 mb-1">السعر قبل الخصم (لإظهار شارة التخفيض)</label><input type="text" value={item.compareAtPrice || ''} onChange={(e) => handleOverrideChange(sectionIndex, itemIndex, 'compareAtPrice', e.target.value)} className="w-full p-2 text-xs border border-red-200 bg-red-50 text-red-700 rounded outline-none" placeholder="مثال: 1500" /></div>
                                              </>
                                            )}
                                          </div>
                                          
                                          <div className="mt-4 flex justify-end">
                                            <button onClick={() => toggleOverride(sectionIndex, itemIndex)} className="bg-[#1A1A1A] text-white px-4 py-1.5 rounded text-xs font-bold">إغلاق التعديل</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}