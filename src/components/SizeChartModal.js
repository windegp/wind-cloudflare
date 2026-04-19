"use client";
import { useEffect } from 'react';

export default function SizeChartModal({ isOpen, onClose, product }) {
  if (!isOpen) return null;

  const chartData = product?.options?.sizeChart || [];
  // جلب العناوين من الداتابيز أو استخدام العناوين الافتراضية لو مش موجودة
  const headers = product?.options?.chartHeaders || {
    col1: 'المقاس',
    col2: 'الطول (CM)',
    col3: 'الصدر (CM)',
    col4: 'الوسط (CM)',
    col5: 'الوزن (كجم)'
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm bg-black/70 animate-fadeIn" dir="rtl">
      {/* Modal Content */}
      <div className="bg-[#1a1a1a] w-full max-w-2xl rounded-2xl border border-[#333] shadow-2xl overflow-hidden relative animate-slideUp">
        
        {/* Header */}
        <div className="bg-[#121212] p-4 flex justify-between items-center border-b border-[#333]">
          <div className="flex items-center gap-3">
            <h2 className="text-[#F5C518] font-bold text-lg tracking-wide">WIND Shopping <span className="text-white text-xs font-normal">SIZE GUIDE</span></h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8">
          
          {/* Product Header inside Modal */}
          <div className="flex items-center gap-4 mb-8 bg-[#222] p-4 rounded-xl border border-[#333]">
            {product.images && product.images[0] && (
               <img src={product.images[0]} alt={product.title} className="w-16 h-16 object-cover rounded-lg border border-[#444]" />
            )}
            <div>
              <h3 className="text-white font-bold text-lg">{product.title}</h3>
              <p className="text-gray-400 text-sm">دليل المقاسات الرسمي</p>
            </div>
          </div>

          {/* Table */}
          {chartData.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-[#333]">
              <table className="w-full text-center text-sm md:text-base">
                <thead className="bg-[#F5C518] text-black">
                  <tr>
                    {/* تحديث: الرؤوس الآن تقرأ من متغير headers الديناميكي */}
                    <th className="py-3 font-bold">{headers.col1}</th>
                    <th className="py-3 font-bold">{headers.col2}</th>
                    <th className="py-3 font-bold">{headers.col3}</th>
                    <th className="py-3 font-bold">{headers.col4}</th>
                    {/* إظهار العمود الخامس فقط إذا كان له عنوان وقيمة */}
                    {headers.col5 && <th className="py-3 font-bold">{headers.col5}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333] bg-[#121212]">
                  {chartData.map((row, i) => (
                    <tr key={i} className="hover:bg-[#1f1f1f] transition-colors text-gray-200">
                      <td className="py-3 font-bold text-[#F5C518] border-l border-[#333]">{row.size}</td>
                      <td className="py-3" style={{direction: 'ltr'}}>{row.length}</td>
                      <td className="py-3" style={{direction: 'ltr'}}>{row.chest}</td>
                      <td className="py-3" style={{direction: 'ltr'}}>{row.waist}</td>
                      {headers.col5 && <td className="py-3" style={{direction: 'ltr'}}>{row.weight}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-10">عفواً، دليل القياسات غير متوفر لهذا المنتج حالياً.</div>
          )}

          {/* Footer Tips */}
          <div className="mt-6 space-y-2">
              <div className="flex items-start gap-2 text-xs text-gray-400 bg-[#222] p-3 rounded">
                <span className="text-[#F5C518] text-lg">•</span>
                <p>يتم أخذ القياسات والقطعة مفرودة على سطح مستوٍ. قد تختلف القياسات الفعلية بمقدار بسيط (1-2 سم).</p>
              </div>
              {chartData.some(r => r.weight) && (
                <div className="flex items-start gap-2 text-xs text-gray-400 bg-[#222] p-3 rounded">
                    <span className="text-[#F5C518] text-lg">•</span>
                    <p>الأوزان المقترحة هي قيم تقديرية وقد تختلف حسب بنية الجسم والطول.</p>
                </div>
              )}
          </div>

        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </div>
  );
}