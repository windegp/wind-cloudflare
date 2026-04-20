"use client";

import React, { useState, useEffect } from "react";
import { getDb } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore/lite";
import { 
  Plus, Save, Loader2, Trash2, Edit2, ExternalLink, CheckSquare, Square, 
  FolderTree, Database, Layout, MonitorSmartphone, Menu, ChevronDown, 
  ChevronRight, Info, X, ChevronUp, CornerDownLeft, LinkIcon, Layers, 
  Paintbrush, ListFilter, PackageSearch, Package, Settings, Target, 
  Mail, Crown, UserMinus, Monitor, Archive, ArrowRight, ArrowLeft, 
  Search, Filter, AlertTriangle, Download, ShoppingCart, Users, Eye, 
  Calendar, Activity, TrendingUp, ShieldCheck, Store, Truck, RefreshCw, 
  Scale, Code2, Share2, CreditCard, Banknote, Smartphone, Lock, Globe, 
  Box, Tag, CheckCircle, CheckCircle2, Home, FileText, DollarSign, 
  BarChart, MessageSquare, ZoomIn, Minus, Star, Heart, ImageIcon, 
  ChevronLeft, MapPin, Phone, ShoppingBag, User 
} from '@/components/icons-extra';
// 🔥 1. استيراد SWR السحري
import useSWR, { mutate } from 'swr';

export const dynamic = 'force-dynamic';

// 🔥 2. دالة الجلب المزدوجة لـ SWR
const fetchMenuData = async () => {
  const db = getDb();
  
  // سحب المنيو
  const menuSnap = await getDoc(doc(db, "settings", "siteSettings"));
  const menuData = menuSnap.exists() ? (menuSnap.data().menuItems || []) : [];

  // سحب الأقسام (للربط)
  const colsSnap = await getDocs(collection(db, "collections"));
  const colsData = colsSnap.docs.map(d => ({
    id: d.id,
    name: String(d.data().name || "بدون اسم"),
    slug: String(d.data().slug || ""),
    productCount: d.data().productCount || 0
  }));

  return { menu: menuData, collections: colsData };
};

// 🔥 دالة التنظيف (مهمة جداً عشان المنيو متبقاش undefined)
const sanitizeData = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    id: String(item.id || Math.random().toString(36).substr(2, 9)),
    title: String(item.title || ""),
    link: String(item.link || "/"),
    children: sanitizeData(item.children || [])
  }));
};

// --- مكون الشجرة (الأكورديون) ---
const RenderMenuTree = ({ list, path = [], depth = 0, availableCollections, expandedItems, toggleAccordion, updateItem, addItem, deleteItem }) => {
  if (!list || list.length === 0) return null;

  return (
    <div className={`flex flex-col gap-3 ${depth > 0 ? 'mt-3 pr-4 sm:pr-8 border-r-2 border-gray-300' : ''}`}>
      {list.map((item, index) => {
        const currentPath = [...path, index];
        const isExpanded = expandedItems.has(item.id);
        const hasChildren = item.children && item.children.length > 0;
        const isDark = depth >= 2; 
        
        const cardStyle = 
          depth === 0 ? "bg-white border-gray-200 shadow-sm" : 
          depth === 1 ? "bg-gray-50 border-gray-300" : 
          depth === 2 ? "bg-[#2b2b2b] border-[#444]" : 
          "bg-[#111] border-[#333]";

        const textColor = isDark ? "text-white" : "text-[#202223]";
        const labelColor = isDark ? "text-gray-400" : "text-gray-500";
        const inputBg = isDark ? "bg-[#1a1a1a] border-[#444] text-white focus:border-[#008060] placeholder-gray-600" : "bg-white border-gray-300 text-[#202223] focus:border-[#008060] placeholder-gray-400";
        const linkBg = isDark ? "bg-[#111] border-[#333] text-gray-400" : "bg-white border-gray-200 text-gray-500";

        return (
          <div key={item.id} className="relative animate-[fadeIn_0.2s_ease-out]">
            {depth > 0 && (
              <div className="absolute top-10 -right-4 sm:-right-8 w-4 sm:w-8 h-[2px] bg-gray-300 z-0"></div>
            )}

            <div className={`
              border p-4 sm:p-5 rounded-xl transition-all duration-200 relative z-10
              ${cardStyle}
              ${isExpanded && depth === 0 ? 'ring-1 ring-[#008060]/30 shadow-md' : ''}
            `}>
              
              <div className={`flex justify-between items-center mb-4 pb-3 border-b ${isDark ? 'border-[#444]' : 'border-gray-200/60'}`}>
                <div className="flex items-center gap-3">
                  {hasChildren ? (
                    <button 
                      onClick={() => toggleAccordion(item.id)} 
                      className={`p-2 rounded-lg transition-all shadow-sm border flex items-center justify-center ${
                        isExpanded 
                          ? 'bg-[#008060] border-[#008060] text-white' 
                          : isDark 
                            ? 'bg-[#444] border-[#555] text-[#F5C518] hover:bg-[#555]' 
                            : 'bg-[#e8f4f0] border-[#008060]/30 text-[#008060] hover:bg-[#d1e9e2]'
                      }`}
                    >
                      {isExpanded ? <ChevronUp size={16} strokeWidth={3}/> : <ChevronDown size={16} strokeWidth={3}/>}
                    </button>
                  ) : (
                    <div className="w-8 h-8 flex items-center justify-center">
                      <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
                    </div>
                  )}
                  <span className={`font-bold text-[10px] px-2 py-1 rounded border ${isDark ? 'bg-[#333] border-[#555] text-gray-300' : 'bg-white border-gray-200 text-[#008060]'}`}>
                    مستوى {depth + 1}
                  </span>
                  <h3 className={`text-sm font-bold truncate max-w-[120px] sm:max-w-xs ${textColor}`}>{item.title || "بند جديد"}</h3>
                </div>

                <button 
                  onClick={() => deleteItem(currentPath)} 
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors border ${isDark ? 'bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-600 hover:text-white' : 'text-red-600 bg-red-50 border-red-100 hover:bg-red-500 hover:text-white'}`}
                >
                  <Trash2 size={14} /> <span className="hidden sm:inline">حذف</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[10px] font-bold mb-1.5 uppercase ${labelColor}`}>ربط بقسم موجود (اختياري)</label>
                  <select 
                    className={`w-full p-2.5 rounded-lg text-sm outline-none transition-all cursor-pointer ${inputBg}`}
                    value={availableCollections.find(c => `/collections/${c.slug}` === item.link)?.slug || ""}
                    onChange={(e) => {
                      const selected = availableCollections.find(c => c.slug === e.target.value);
                      if (selected) {
                        updateItem(currentPath, 'title', selected.name);
                        updateItem(currentPath, 'link', `/collections/${selected.slug}`);
                      }
                    }}
                  >
                    <option value="">-- اختر قسماً للربط --</option>
                    {availableCollections.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className={`block text-[10px] font-bold mb-1.5 uppercase ${labelColor}`}>عنوان القسم (كما يظهر للعميل)</label>
                  <input 
                    type="text" 
                    value={item.title} 
                    onChange={(e) => updateItem(currentPath, 'title', e.target.value)}
                    className={`w-full p-2.5 rounded-lg text-sm font-bold outline-none transition-all ${inputBg}`}
                    placeholder="مثال: أحدث الشيلان"
                  />
                </div>
              </div>

              <div className={`mt-4 pt-4 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isDark ? 'border-[#444]' : 'border-gray-200/60'}`}>
                <div className={`flex-1 w-full sm:w-auto flex items-center gap-2 px-3 py-2 rounded-lg border ${linkBg}`}>
                  <LinkIcon size={14} className="shrink-0" />
                  <span className="text-[11px] font-mono truncate w-full" dir="ltr" title={item.link}>{item.link}</span>
                </div>
                
                <button 
                  onClick={() => addItem(currentPath)} 
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-sm border ${isDark ? 'bg-white text-black hover:bg-gray-200 border-white' : 'bg-[#202223] text-white hover:bg-black border-[#202223]'}`}
                >
                  <CornerDownLeft size={14} className="rtl:rotate-180" /> 
                  إضافة قسم فرعي داخل "{item.title || 'هذا القسم'}"
                </button>
              </div>

              {hasChildren && isExpanded && (
                <div className="mt-2 animate-[slideDown_0.3s_ease-out]">
                  <RenderMenuTree 
                    list={item.children} 
                    path={currentPath} 
                    depth={depth + 1} 
                    availableCollections={availableCollections}
                    expandedItems={expandedItems}
                    toggleAccordion={toggleAccordion}
                    updateItem={updateItem}
                    addItem={addItem}
                    deleteItem={deleteItem}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function ProfessionalMenuManager() {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set()); 
  const [isInitialized, setIsInitialized] = useState(false); // للتحكم في التهيئة مرة واحدة

  // 🔥 3. استخدام SWR لمرة واحدة وبناء الكاش
  const { data, isLoading: loading, error } = useSWR('menu-data', fetchMenuData);

  const availableCollections = data?.collections || [];

  // 🔥 4. نقل الداتا من الكاش للـ State عشان نقدر نعدل عليها في الواجهة
  useEffect(() => {
    if (data && !isInitialized) {
      setItems(sanitizeData(data.menu));
      setIsInitialized(true);
    }
  }, [data, isInitialized]);

  const toggleAccordion = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedItems(newExpanded);
  };

  const updateItem = (path, field, value) => {
    const newItems = JSON.parse(JSON.stringify(items));
    let current = { children: newItems };
    path.forEach(idx => { current = current.children[idx]; });
    current[field] = value;
    setItems(newItems);
  };

  const addItem = (path = null) => {
    const newItem = { id: Math.random().toString(36).substr(2, 9), title: "بند جديد", link: "/", children: [] };
    const newItems = JSON.parse(JSON.stringify(items));
    
    if (path === null) {
      newItems.unshift(newItem);
    } else {
      let current = { children: newItems };
      path.forEach(idx => { current = current.children[idx]; });
      current.children.push(newItem);
      
      const parentId = current.id;
      if (parentId) {
        const newExpanded = new Set(expandedItems);
        newExpanded.add(parentId);
        setExpandedItems(newExpanded);
      }
    }
    setItems(newItems);
  };

  const deleteItem = (path) => {
    if (!confirm("سيتم حذف هذا القسم وكل ما بداخله، هل أنت متأكد؟")) return;
    const newItems = JSON.parse(JSON.stringify(items));
    if (path.length === 1) newItems.splice(path[0], 1);
    else {
      let parent = { children: newItems };
      for (let i = 0; i < path.length - 1; i++) { parent = parent.children[path[i]]; }
      parent.children.splice(path[path.length - 1], 1);
    }
    setItems(newItems);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex flex-col items-center justify-center text-[#202223]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#202223] mb-4"></div>
        <p className="font-bold text-sm text-gray-500">جاري تحميل هيكل المتجر...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-[#f4f6f8] min-h-screen text-[#202223] font-sans" dir="rtl">
      <div className="max-w-4xl mx-auto pb-24">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-white p-5 md:p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[#008060]">
              <Layers size={28}/>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#202223]">القوائم (Navigation)</h1>
              <p className="text-xs text-gray-500 mt-1">نظام إدارة الأقسام الشجرية المترابطة</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10">
            <button 
              onClick={() => addItem()} 
              className="w-full sm:w-auto bg-white border border-gray-300 text-[#202223] px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all shadow-sm"
            >
              <Plus size={16}/> إضافة قسم رئيسي جديد
            </button>
            <button 
              onClick={async () => {
                setSaving(true);
                const db = getDb();
                // 🔥 التعديل هنا للكتابة: الحفظ في siteSettings مع الحفاظ على البيانات الأخرى (merge: true)
                await setDoc(doc(db, "settings", "siteSettings"), { menuItems: items }, { merge: true });
                // 🔥 مسح KV Cache للصفحة الرئيسية
// 🔥 مسح KV Cache للصفحة الرئيسية
try {
  await Promise.all([
    fetch("/api/invalidate-homepage", { method: "POST" }),
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.REVALIDATE_SECRET, type: "site_settings" })
    })
  ]);
} catch {}
                
                // 🔥 تحديث كاش SWR صمتاً بالبيانات الجديدة
                mutate('menu-data', { menu: items, collections: availableCollections }, false);
                
                setSaving(false);
                alert("تم حفظ الهيكل بنجاح!");
              }} 
              disabled={saving}
              className={`w-full sm:w-auto px-8 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all ${
                saving ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'bg-[#008060] text-white hover:bg-[#006e52]'
              }`}
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </div>
        </header>

        <div className="bg-white p-4 sm:p-8 rounded-2xl border border-gray-200 shadow-sm min-h-[50vh]">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-80">
              <Menu size={56} className="text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-[#202223]">لا توجد أقسام حالياً</h3>
              <p className="text-sm text-gray-500 mt-2 max-w-sm">ابدأ بإضافة قسم رئيسي ثم قم بتفريعه من الداخل.</p>
              <button onClick={() => addItem()} className="mt-6 bg-gray-50 border border-gray-200 text-[#202223] font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-100 transition-colors flex items-center gap-2 shadow-sm">
                <Plus size={16}/> إضافة أول قسم رئيسي
              </button>
            </div>
          ) : (
            <RenderMenuTree 
              list={items} 
              availableCollections={availableCollections}
              expandedItems={expandedItems}
              toggleAccordion={toggleAccordion}
              updateItem={updateItem}
              addItem={addItem}
              deleteItem={deleteItem}
            />
          )}
        </div>
      </div>
    </div>
  );
}