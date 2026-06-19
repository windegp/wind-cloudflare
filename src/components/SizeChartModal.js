"use client";

export default function SizeChartModal({ isOpen, onClose, product }) {
  if (!isOpen) return null;

  // 🔥 تحويل نص المقاسات بصيغة "S:58:72, M:60:74" إلى صفوف منظمة { size, chest, length }
  const rawChart = product?.metafields?.sizeChart || "";
  const chartRows = rawChart
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [size, chest, length] = entry.split(':').map(v => v?.trim());
      return { size, chest, length };
    })
    .filter(row => row.size);

  const productImage = product?.images?.[0] || product?.mainImage || "";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60 animate-fadeIn" dir="rtl">

      <div className="bg-white w-full max-w-md border border-[#EBEBEB] shadow-2xl relative animate-slideUp">

        {/* زر الإغلاق */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-white border border-[#E0E0E0] flex items-center justify-center text-[#666] hover:bg-[#F5F5F5] transition-colors"
        >
          <span className="text-xl leading-none">&times;</span>
        </button>

        <div className="p-6 sm:p-8">

          {/* الصفوف العلوية: اسم المنتج (يمين) / دليل المقاسات (شمال) */}
          <div className="flex items-center justify-between mb-8 pl-8">
            <span className="text-[12px] font-bold text-[#111] tracking-wide truncate max-w-[60%]">
              {product?.title}
            </span>
            <span className="text-[11px] tracking-[0.12em] text-[#999] font-medium uppercase shrink-0">
              دليل المقاسات
            </span>
          </div>

          {/* صورة المنتج الرئيسية */}
          {productImage && (
            <div className="flex justify-center mb-8">
              <img
                src={productImage}
                alt={product?.title}
                className="h-[180px] w-auto object-contain"
              />
            </div>
          )}

          {/* الجدول */}
          {chartRows.length > 0 ? (
            <table className="w-full text-center text-sm">
              <thead className="bg-[#111111] text-white">
                <tr>
                  <th className="py-3 font-medium tracking-wide">المقاس</th>
                  <th className="py-3 font-medium tracking-wide">العرض</th>
                  <th className="py-3 font-medium tracking-wide">الطول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB] bg-white">
  {chartRows.map((row, i) => (
    <tr key={i} className="text-[#111]">
      <td className="py-3 font-medium">{row.size}</td>
      <td className="py-3" style={{ direction: 'rtl' }}>سم {row.chest}</td>
      <td className="py-3" style={{ direction: 'rtl' }}>سم {row.length}</td>
    </tr>
  ))}
</tbody>
            </table>
          ) : (
            <div className="text-center text-[#999] text-sm py-10 border border-[#EBEBEB]">
              دليل القياسات غير متوفر لهذا المنتج حالياً.
            </div>
          )}

          {/* البراند في الأسفل */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#F0F0F0]">
            <span className="text-[13px] font-bold text-[#111] tracking-wide">WIND Shopping</span>
            <span className="text-[11px] text-[#999]" dir="ltr">windeg.com</span>
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