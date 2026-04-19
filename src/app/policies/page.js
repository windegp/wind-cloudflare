"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Truck, RefreshCcw, ShieldCheck, Scale, ArrowLeft } from '@/components/icons-extra';

const policies = [
  {
    id: 'shipping-policy',
    title: 'سياسة الشحن والتوصيل',
    enTitle: 'Shipping Policy',
    desc: 'كل ما تود معرفته عن مواعيد التوصيل، التكلفة، والشحن المجاني.',
    icon: <Truck size={32} />,
  },
  {
    id: 'refund-policy',
    title: 'سياسة الاستبدال والاسترجاع',
    enTitle: 'Refund Policy',
    desc: 'شروط استرجاع المنتجات وضمان حقك في تجربة شراء آمنة.',
    icon: <RefreshCcw size={32} />,
  },
  {
    id: 'terms-of-service',
    title: 'الشروط والأحكام',
    enTitle: 'Terms of Service',
    desc: 'اتفاقية الاستخدام والقواعد العامة للتسوق عبر متجرنا.',
    icon: <Scale size={32} />,
  },
  {
    id: 'privacy-policy',
    title: 'سياسة الخصوصية',
    enTitle: 'Privacy Policy',
    desc: 'كيف نحمي بياناتك ونحافظ على سرية معلوماتك الشخصية.',
    icon: <ShieldCheck size={32} />,
  },
];

export default function PoliciesHub() {
  
  // SEO Meta Tags
  useEffect(() => {
    document.title = "مركز السياسات القانونية | WIND Shopping";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "اطلع على كافة السياسات القانونية لمتجر WIND Shopping، بما في ذلك سياسة الشحن، الاسترجاع، وشروط الاستخدام.");
    }
  }, []);

  return (
    <div className="hub-container" dir="rtl">
      <style jsx>{`
        .hub-container {
          background: #000;
          min-height: 100vh;
          font-family: 'Cairo', sans-serif;
          color: #fff;
          padding: 60px 20px;
          position: relative;
          overflow: hidden;
        }

        /* خلفية فخمة */
        .hub-container::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(circle at top right, rgba(245, 197, 24, 0.08), transparent 40%),
                      radial-gradient(circle at bottom left, rgba(245, 197, 24, 0.05), transparent 40%);
          pointer-events: none;
        }

        header { text-align: center; margin-bottom: 50px; position: relative; z-index: 1; }
        .logo { width: 100px; margin-bottom: 20px; border-radius: 20px; }
        h1 { font-size: 2rem; font-weight: 900; margin-bottom: 10px; }
        .subtitle { color: #888; font-size: 0.9rem; }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          max-width: 1000px;
          margin: 0 auto;
          position: relative; z-index: 1;
        }

        .policy-card {
          background: rgba(26, 20, 0, 0.6);
          border: 1px solid rgba(245, 197, 24, 0.15);
          border-radius: 24px;
          padding: 30px;
          text-decoration: none;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          backdrop-filter: blur(10px);
        }

        .policy-card:hover {
          background: rgba(245, 197, 24, 0.05);
          border-color: #F5C518;
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }

        .icon-box {
          width: 60px; height: 60px;
          background: rgba(245, 197, 24, 0.1);
          border-radius: 18px;
          display: flex; items-center; justify-content: center;
          color: #F5C518;
          margin-bottom: 20px;
          transition: 0.3s;
        }

        .policy-card:hover .icon-box {
          background: #F5C518;
          color: #000;
        }

        h2 { font-size: 1.2rem; font-weight: 800; margin-bottom: 5px; color: #fff; }
        .en-title { font-size: 0.7rem; color: #F5C518; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; display: block; }
        p { color: #aaa; font-size: 0.85rem; line-height: 1.6; }

        .footer-link {
            text-align: center; margin-top: 50px;
        }
        .back-btn {
            color: #888; font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
            transition: 0.3s;
        }
        .back-btn:hover { color: #F5C518; }
      `}</style>

      <header>
        <img src="https://ik.imagekit.io/windeg/WIND_Shopping/logo_0WuyNIRzi.jpg?updatedAt=1772130133302" alt="WIND" className="logo" />
        <h1>مركز السياسات</h1>
        <p className="subtitle">كل ما تود معرفته حول حقوقك وواجباتنا تجاهك في مكان واحد.</p>
      </header>

      <main className="grid">
        {policies.map((item) => (
          <Link href={`/policies/${item.id}`} key={item.id} className="policy-card">
            <div className="icon-box">
              {item.icon}
            </div>
            <span className="en-title">{item.enTitle}</span>
            <h2>{item.title}</h2>
            <p>{item.desc}</p>
          </Link>
        ))}
      </main>

      <div className="footer-link">
        <Link href="/" className="back-btn">
             العودة للرئيسية <ArrowLeft size={16} />
        </Link>
      </div>
    </div>
  );
}