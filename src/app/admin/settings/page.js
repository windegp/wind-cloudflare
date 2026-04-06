"use client";

import React from 'react';
import Link from 'next/link';
import { Settings, ShieldCheck, Store, Truck } from '@/components/icons-extra';
import { 
  CreditCard, 
  Share2, 
  ChevronLeft 
} from '@/components/icons-extra';

export const dynamic = 'force-dynamic';

const settingsOptions = [
  {
    id: 'policies',
    title: 'السياسات القانونية',
    desc: 'تعديل سياسات الشحن، الخصوصية، والشروط والأحكام.',
    icon: <ShieldCheck size={28} />,
    path: '/admin/settings/policies', // ده المسار اللي عملناه سوا
    color: 'bg-emerald-50 text-emerald-600'
  },
  {
    id: 'general',
    title: 'معلومات المتجر',
    desc: 'تعديل اسم المتجر، اللوجو، وأرقام التواصل الرسمية.',
    icon: <Store size={28} />,
    path: '/admin/settings/general',
    color: 'bg-blue-50 text-blue-600'
  },
  {
    id: 'shipping',
    title: 'أسعار الشحن',
    desc: 'تعديل تكلفة الشحن لكل محافظة والحد الأدنى للشحن المجاني.',
    icon: <Truck size={28} />,
    path: '/admin/settings/shipping',
    color: 'bg-orange-50 text-orange-600'
  },
  {
    id: 'social',
    title: 'حسابات التواصل',
    desc: 'ربط روابط الفيسبوك، انستجرام، وواتساب المتجر.',
    icon: <Share2 size={28} />,
    path: '/admin/settings/social',
    color: 'bg-purple-50 text-purple-600'
  }
];

export default function AdminSettings() {
  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white rounded-xl shadow-sm">
              <Settings className="text-[#008060]" size={24} />
            </div>
            <h1 className="text-2xl font-black text-gray-900">إعدادات النظام</h1>
          </div>
          <p className="text-gray-500 font-bold text-sm">تحكم في كافة مفاصل المتجر وبياناته الأساسية من مكان واحد.</p>
        </header>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsOptions.map((option) => (
            <Link 
              key={option.id} 
              href={option.path}
              className="group bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#008060]/30 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-2xl ${option.color} transition-transform group-hover:scale-110`}>
                  {option.icon}
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-800 mb-1">{option.title}</h2>
                  <p className="text-xs text-gray-500 font-bold max-w-[200px] leading-relaxed">
                    {option.desc}
                  </p>
                </div>
              </div>
              
              <div className="text-gray-300 group-hover:text-[#008060] group-hover:translate-x-[-5px] transition-all">
                <ChevronLeft size={24} />
              </div>
            </Link>
          ))}
        </div>

        {/* Footer Note */}
        <footer className="mt-12 text-center p-8 border-t border-gray-200">
          <p className="text-gray-400 text-xs font-bold">
            جميع الإعدادات يتم حفظها وتشفيرها عبر خوادم WIND السحابية.
          </p>
        </footer>

      </div>
    </div>
  );
}