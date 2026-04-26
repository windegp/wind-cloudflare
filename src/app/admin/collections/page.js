"use client";
import { useState, useEffect } from 'react';
import { getDb } from "@/lib/firebase";
import { collection, doc, query, orderBy, getDocs, writeBatch, where, arrayUnion, arrayRemove } from "firebase/firestore/lite";
import { Plus, Trash2, Search, ArrowRight, AlertCircle, X, Star, Heart, Check, RotateCcw, FileText } from '@/components/icons-extra';
import { Edit2, ExternalLink, Loader2, Save, ImageIcon, CheckSquare, Square, FolderTree } from '@/components/icons-extra';
// 🔥 1. استدعاء Hook السحر من SWR
import useSWR, { mutate } from 'swr';

export const dynamic = 'force-dynamic';

// 🔥 2. دالة جلب البيانات (Fetcher) اللي SWR هيستخدمها
const fetchCollections = async () => {
    const db = getDb();
    const q = query(collection(db, "collections"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export default function CollectionsPage() {
    const [view, setView] = useState('list');
    const [isSaving, setIsSaving] = useState(false);

    const [activeId, setActiveId] = useState(null);
    const [originalSlug, setOriginalSlug] = useState(""); 
    const [originalProductIds, setOriginalProductIds] = useState([]); 
    
    // --- 1. تحديث الـ Form Data (إضافة الـ SEO) ---
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        subtitle: '', 
        description: '',
        bottomDescription: '', 
        image: '',
        seoTitle: '',
        seoDescription: ''
    });

    // --- 2. إدارة نافذة المنتجات العريضة (Modal) ---
    const [selectedProducts, setSelectedProducts] = useState([]); 
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [allProducts, setAllProducts] = useState([]); 
    const [isSearching, setIsSearching] = useState(false);

    // 🔥 3. استبدال useEffect بـ useSWR (هنا بيحصل السحر والكاش)
    // الكلمة "collections-data" دي مفتاح الكاش، لو موجودة في الذاكرة مش هيسحب من الفايربيز
    const { data: collections, isLoading: loading, error } = useSWR('collections-data', fetchCollections);

    // جلب المنتجات للمودال
    useEffect(() => {
        if (!isProductModalOpen) return;
        const fetchAllProducts = async () => {
            setIsSearching(true);
            try {
                const db = getDb();
                const q = query(collection(db, "products")); 
                const snapshot = await getDocs(q);
                setAllProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } catch (error) {
                console.error("Fetch products error:", error);
            } finally {
                setIsSearching(false);
            }
        };
        fetchAllProducts();
    }, [isProductModalOpen]);

    const openEditor = async (collectionItem = null) => {
        if (collectionItem) {
            setActiveId(collectionItem.id);
            setOriginalSlug(collectionItem.slug);
            setFormData({
                name: collectionItem.name || '',
                slug: collectionItem.slug || '',
                subtitle: collectionItem.subtitle || '',
                description: collectionItem.description || '',
                bottomDescription: collectionItem.bottomDescription || '',
                image: collectionItem.image || '',
                seoTitle: collectionItem.seoTitle || '',
                seoDescription: collectionItem.seoDescription || ''
            });

            // هنا بنفتح المحرر، مش محتاجين loading عام للشاشة كلها
            try {
                const db = getDb();
                const q = query(collection(db, "products"), where("categories", "array-contains-any", [collectionItem.slug, `/${collectionItem.slug}`]));
                const snapshot = await getDocs(q);
                const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setSelectedProducts(products);
                setOriginalProductIds(products.map(p => p.id)); 
            } catch (error) { console.error(error); } 
        } else {
            setActiveId(null);
            setOriginalSlug("");
            setOriginalProductIds([]);
            setSelectedProducts([]);
            setFormData({ name: '', slug: '', subtitle: '', description: '', bottomDescription: '', image: '', seoTitle: '', seoDescription: '' });
        }
        setView('editor');
    };

    const toggleProductSelection = (product) => {
        const isSelected = selectedProducts.find(p => p.id === product.id);
        if (isSelected) {
            setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
        } else {
            setSelectedProducts([...selectedProducts, product]);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const db = getDb();
            let cleanSlug = formData.slug.trim().toLowerCase().replace(/\s+/g, '-');
            if (!cleanSlug) cleanSlug = formData.name.trim().toLowerCase().replace(/\s+/g, '-');
            cleanSlug = cleanSlug.replace(/^\/+/, '');

         const collectionPayload = {
                name: formData.name.trim(),
                slug: cleanSlug,
                subtitle: formData.subtitle.trim(),
                description: formData.description,
                bottomDescription: formData.bottomDescription,
                image: formData.image,
                seoTitle: formData.seoTitle?.trim() || "",
                seoDescription: formData.seoDescription?.trim() || "",
                updatedAt: new Date(),
                productCount: selectedProducts.length
            };

            const batch = writeBatch(db);
            let targetRef = activeId ? doc(db, "collections", activeId) : doc(collection(db, "collections"));
            activeId ? batch.update(targetRef, collectionPayload) : batch.set(targetRef, collectionPayload);

            const productsToAdd = selectedProducts.filter(p => !originalProductIds.includes(p.id));
            productsToAdd.forEach(product => {
                batch.update(doc(db, "products", product.id), { categories: arrayUnion(cleanSlug, `/${cleanSlug}`) });
            });

            if (originalSlug) {
                const productsToCleanIds = [...new Set([...originalProductIds, ...selectedProducts.map(p => p.id)])];
                productsToCleanIds.forEach(id => {
                    const productRef = doc(db, "products", id);
                    const isStillSelected = selectedProducts.find(p => p.id === id);
                    batch.update(productRef, { categories: arrayRemove(originalSlug, `/${originalSlug}`) });
                    if (isStillSelected) batch.update(productRef, { categories: arrayUnion(cleanSlug, `/${cleanSlug}`) });
                });
            } else {
                const productsToRemoveIds = originalProductIds.filter(id => !selectedProducts.find(p => p.id === id));
                productsToRemoveIds.forEach(id => {
                    batch.update(doc(db, "products", id), { categories: arrayRemove(cleanSlug, `/${cleanSlug}`) });
                });
            }

            await batch.commit();
            
            // 🔥 4. بدلاً من تحديث الـ State يدوياً، نأمر SWR بتحديث الكاش أوتوماتيكياً
            mutate('collections-data');
            // 🔥 مسح KV Cache للكوليكشن والصفحة الرئيسية
try {
  const slugToInvalidate = formData.slug?.trim().replace(/^\//, '');
  
  await fetch("/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 'collection', slug: slugToInvalidate })
  });
} catch (error) {
  console.error("WIND Error: Collection and Homepage revalidate failed", error);
}

            setView('list');
            alert("تم التحديث بنجاح!");
        } catch (error) { alert("حدث خطأ أثناء الحفظ"); } 
        finally { setIsSaving(false); }
    };

    const handleDeleteCollection = async (id, slug) => {
        if (confirm("تحذير: سيتم حذف القسم وإزالة ارتباطه بكافة المنتجات. هل أنت متأكد؟")) {
            try {
                const db = getDb();
                const batch = writeBatch(db);
                batch.delete(doc(db, "collections", id));
                const q = query(collection(db, "products"), where("categories", "array-contains-any", [slug, `/${slug}`]));
                const snapshot = await getDocs(q);
                snapshot.docs.forEach(productDoc => {
                    batch.update(doc(db, "products", productDoc.id), { categories: arrayRemove(slug, `/${slug}`) });
                });
                await batch.commit();
                
                // 🔥 5. تحديث الكاش بعد الحذف
                mutate('collections-data');

            } catch (err) { alert("خطأ في الحذف"); }
        }
    };

    const filteredProducts = allProducts.filter(p => p.title?.toLowerCase().includes(searchQuery.toLowerCase()));

    // معالجة حالة الخطأ
    if (error) return <div className="text-center p-10 text-red-500">حدث خطأ أثناء جلب الأقسام.</div>;

    if (loading && view === 'list') return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#f4f6f8] text-[#202223]">
            <Loader2 className="animate-spin mb-4 text-[#202223]" size={40} />
            <p className="font-bold text-sm tracking-wide text-gray-500">جاري التحميل...</p>
        </div>
    );

    if (view === 'editor') {
        return (
            <div className="min-h-screen bg-[#f4f6f8] text-[#202223] pb-20 font-sans" dir="rtl">
                {/* Navbar */}
                <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 lg:px-6 py-3 lg:py-4 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3 lg:gap-4">
                        <button onClick={() => setView('list')} className="p-2 -m-2 text-gray-500 hover:text-black transition-colors rounded-lg hover:bg-gray-100">
                            <ArrowRight size={20} />
                        </button>
                        <h1 className="text-lg lg:text-xl font-bold text-[#202223] line-clamp-1">{activeId ? `تعديل: ${formData.name}` : 'إضافة قسم جديد'}</h1>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handleSave} disabled={isSaving} className="bg-[#1a1a1a] text-white px-5 lg:px-8 py-2 rounded-xl text-sm lg:text-base font-bold flex items-center gap-2 hover:bg-black transition-all shadow-sm disabled:opacity-50">
                            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 
                            <span className="hidden sm:inline">حفظ التغييرات</span>
                            <span className="sm:hidden">حفظ</span>
                        </button>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto mt-6 lg:mt-8 px-4 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    {/* Right Column (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* 1. Basic Details */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 lg:p-6">
                            <h3 className="text-sm font-bold mb-4 text-[#202223]">البيانات الأساسية</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">عنوان القسم الرئيسي</label>
                                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none transition-all" placeholder="مثلاً: الشيلان" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">الوصف الفرعي (تحت العنوان)</label>
                                    <input type="text" value={formData.subtitle} onChange={(e) => setFormData({...formData, subtitle: e.target.value})} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none transition-all" placeholder="مثلاً: WIND ESSENTIALS" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">الوصف المختصر</label>
                                    <textarea rows={2} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none resize-none transition-all" placeholder="يظهر أسفل العنوان الرئيسي..." />
                                </div>
                            </div>
                        </div>

                        {/* 2. SEO Bottom Description */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 lg:p-6">
                            <h3 className="text-sm font-bold mb-1.5 text-[#202223]">وصف محركات البحث (SEO)</h3>
                            <p className="text-[11px] text-gray-500 mb-4">هذا النص سيظهر أسفل المنتجات في صفحة القسم، لتحسين الأرشفة.</p>
                            <textarea 
                                rows={6} 
                                value={formData.bottomDescription} 
                                onChange={(e) => setFormData({...formData, bottomDescription: e.target.value})} 
                                className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none resize-y transition-all" 
                                placeholder="اكتب وصفاً طويلاً يحتوي على الكلمات المفتاحية هنا..." 
                            />
                        </div>

                        {/* 3. Products Summary Card */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 lg:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="text-sm font-bold text-[#202223] mb-1">المنتجات المرتبطة</h3>
                                <p className="text-xs text-gray-500">يحتوي القسم على <span className="text-[#008060] font-bold bg-green-50 px-1.5 py-0.5 rounded">{selectedProducts.length}</span> منتج.</p>
                            </div>
                            <button 
                                onClick={() => setIsProductModalOpen(true)}
                                className="w-full sm:w-auto bg-white border border-gray-300 text-[#202223] hover:bg-gray-50 hover:border-gray-400 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm"
                            >
                                إدارة المنتجات
                            </button>
                        </div>

                        {/* 4. محركات البحث (SEO Shopify Style) */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 lg:p-6">
                            <h3 className="text-sm font-bold mb-5 text-[#202223]">محركات البحث (SEO)</h3>
                            
                            {/* معاينة محرك البحث */}
                            <div className="mb-6">
                                <p className="text-xs font-medium text-gray-600 mb-2">معاينة محرك البحث</p>
                                <div className="text-sm">
                                    <span className="text-[#202223] font-medium block">WIND Shopping</span>
                                    <span className="text-[#008060] text-xs block mt-0.5" dir="ltr">https://windeg.com/collections/{formData.slug || 'shop-all'}</span>
                                    <span className="text-[#1a0dab] text-base font-medium block mt-1.5 line-clamp-1">{formData.seoTitle || formData.name || 'اسم القسم'}</span>
                                    <span className="text-[#4d5156] text-sm line-clamp-2 mt-1">{formData.seoDescription || formData.description || 'وصف القسم سيظهر هنا في محركات البحث...'}</span>
                                </div>
                            </div>

                            <div className="space-y-4 pt-5 border-t border-gray-100">
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label className="text-xs font-medium text-gray-600 block">عنوان الصفحة (Page title)</label>
                                        <span className="text-[10px] text-gray-500">{(formData.seoTitle || "").length} of 70 characters used</span>
                                    </div>
                                    <input 
                                        type="text" 
                                        maxLength={70}
                                        value={formData.seoTitle || ""} 
                                        onChange={(e) => setFormData({...formData, seoTitle: e.target.value})} 
                                        className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none transition-all" 
                                    />
                                </div>
                                
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label className="text-xs font-medium text-gray-600 block">الوصف (Meta description)</label>
                                        <span className="text-[10px] text-gray-500">{(formData.seoDescription || "").length} of 160 characters used</span>
                                    </div>
                                    <textarea 
                                        rows={3}
                                        maxLength={160}
                                        value={formData.seoDescription || ""} 
                                        onChange={(e) => setFormData({...formData, seoDescription: e.target.value})} 
                                        className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none resize-none transition-all" 
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">رابط الصفحة (URL handle)</label>
                                    <div className="flex items-center text-sm bg-white border border-gray-300 rounded-lg overflow-hidden focus-within:border-[#008060] focus-within:ring-1 focus-within:ring-[#008060] transition-all" dir="ltr">
                                        <span className="text-gray-500 whitespace-nowrap py-2.5 pl-3 pr-1 bg-gray-50 border-r border-gray-300">https://windeg.com/collections/</span>
                                        <input 
                                            type="text" 
                                            value={formData.slug} 
                                            onChange={(e) => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})} 
                                            className="bg-transparent text-[#202223] outline-none flex-1 py-2.5 px-2 w-full min-w-0 font-mono" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Left Column (1/3): Settings */}
                    <div className="space-y-6">
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 lg:p-6">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">صورة الكولكشن</h3>
                            <div className="border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center h-40 lg:h-48 bg-gray-50 mb-4 overflow-hidden">
                                {formData.image ? <img src={formData.image} alt="Preview" className="w-full h-full object-cover" /> : <div className="text-center p-4"><ImageIcon size={28} className="text-gray-400 mx-auto mb-2" /><span className="text-[10px] text-gray-500">لا توجد صورة</span></div>}
                            </div>
                            <input type="url" value={formData.image} onChange={(e) => setFormData({...formData, image: e.target.value})} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs text-[#202223] outline-none focus:border-[#008060] focus:ring-1 focus:ring-[#008060] transition-all font-mono" placeholder="رابط الصورة (URL)" dir="ltr" />
                        </div>
                    </div>
                </div>

                {/* --- نافذة إدارة المنتجات (Modal) --- */}
                {isProductModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsProductModalOpen(false)}></div>
                        <div className="bg-[#f4f6f8] border border-gray-200 w-full sm:max-w-4xl h-[90vh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl relative z-10 flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                            
                            {/* Header المودال */}
                            <div className="p-4 sm:p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-t-2xl">
                                <div className="flex justify-between w-full sm:w-auto items-center">
                                    <div>
                                        <h2 className="text-lg font-bold text-[#202223]">اختيار المنتجات</h2>
                                        <p className="text-xs text-gray-500 mt-0.5">تم اختيار {selectedProducts.length} منتجات</p>
                                    </div>
                                    <button onClick={() => setIsProductModalOpen(false)} className="sm:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><X size={20}/></button>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <div className="relative w-full sm:w-72">
                                        <Search className="absolute right-3 top-2.5 text-gray-400" size={16} />
                                        <input 
                                            type="text" 
                                            placeholder="ابحث عن منتج..." 
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-lg py-2 pr-9 pl-4 text-sm text-[#202223] focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none transition-all"
                                        />
                                    </div>
                                    <button onClick={() => setIsProductModalOpen(false)} className="hidden sm:block p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200"><X size={20}/></button>
                                </div>
                            </div>

                            {/* شبكة المنتجات مع Checkboxes */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#f4f6f8] custom-scrollbar">
                                {isSearching ? (
                                    <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-gray-400" size={32} /></div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                                        {(searchQuery ? filteredProducts : allProducts).map(prod => {
                                            const isSelected = selectedProducts.find(p => p.id === prod.id);
                                            return (
                                                <div 
                                                    key={prod.id} 
                                                    onClick={() => toggleProductSelection(prod)}
                                                    className={`cursor-pointer group relative bg-white border rounded-xl overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md ${isSelected ? 'border-[#008060] ring-1 ring-[#008060]' : 'border-gray-200 hover:border-gray-300'}`}
                                                >
                                                    <div className="h-32 sm:h-36 bg-gray-100 relative">
                                                        <img src={prod.images?.[0] || '/placeholder.png'} className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'}`} alt="" />
                                                        <div className="absolute top-2 right-2 bg-white rounded shadow-sm p-0.5">
                                                            {isSelected ? <CheckSquare className="text-[#008060]" size={18} /> : <Square className="text-gray-300" size={18} />}
                                                        </div>
                                                    </div>
                                                    <div className="p-2 sm:p-3 border-t border-gray-100">
                                                        <p className="text-[11px] sm:text-xs font-bold text-[#202223] truncate" title={prod.title}>{prod.title}</p>
                                                        <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1">{prod.price} EGP</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer المودال */}
                            <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl flex justify-end">
                                <button onClick={() => setIsProductModalOpen(false)} className="w-full sm:w-auto bg-[#1a1a1a] text-white px-8 py-2.5 rounded-xl text-sm font-bold hover:bg-black transition-colors shadow-sm">
                                    تأكيد وإغلاق
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- LIST VIEW ---
    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-[#f4f6f8] min-h-screen text-[#202223] font-sans" dir="rtl">
            <div className="max-w-6xl mx-auto">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[#202223]">الأقسام (Collections)</h1>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1">إدارة جميع أقسام متجرك</p>
                    </div>
                    <button onClick={() => openEditor(null)} className="w-full sm:w-auto bg-[#1a1a1a] text-white px-5 sm:px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-sm">
                        <Plus size={18} /> قسم جديد
                    </button>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* تأكدنا إن collections عبارة عن Array قبل ما نعمل Map عليها */}
                    {Array.isArray(collections) && collections.map((item) => (
                        <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden group hover:shadow-md transition-all flex flex-col">
                            <div className="h-36 sm:h-48 bg-gray-50 relative border-b border-gray-100">
                                {item.image ? (
                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                                        <ImageIcon className="text-gray-300 mb-2" size={28} />
                                        <span className="text-[10px] text-gray-400">بدون صورة</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 sm:p-5 flex-1 flex flex-col">
                                <h3 className="text-base font-bold text-[#202223] mb-1 line-clamp-1">{item.name}</h3>
                                <p className="text-gray-500 text-xs line-clamp-2 mb-4 flex-1 leading-relaxed">{item.description || "لا يوجد وصف"}</p>
                                
                                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                    <div className="flex gap-1.5">
                                        <button onClick={() => openEditor(item)} className="p-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-black transition-colors text-gray-600 shadow-sm" title="تعديل">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteCollection(item.id, item.slug)} className="p-2 bg-red-50 border border-red-100 rounded-lg hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors text-red-600 shadow-sm" title="حذف">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <a href={`/collections/${item.slug}`} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-gray-500 hover:text-[#008060] flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-[#008060]/30 transition-colors">
                                        عرض <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {/* لو مفيش أقسام */}
                    {Array.isArray(collections) && collections.length === 0 && (
                        <div className="col-span-full py-16 text-center bg-white border border-dashed border-gray-300 rounded-xl">
                            <FolderTree size={40} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 text-sm font-medium">لا توجد أقسام حالياً. ابدأ بإنشاء قسم جديد.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}