"use client";

export default function ProductCard({ image, title, price, rating, category }) {
  return (
    <div className="bg-[#1a1a1a] rounded overflow-hidden border border-[#333] hover:bg-[#252525] transition-all duration-300 group flex flex-col h-full shadow-lg">
      
      {/* منطقة الصورة (البوستر) */}
      <div className="relative aspect-[2/3] overflow-hidden">
        {/* علامة الحفظ - Bookmark بستايل Wind */}
        <div className="absolute top-0 right-0 z-10 p-2 text-white/50 hover:text-[#F5C518] cursor-pointer transition">
          <svg className="w-8 h-8 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
          </svg>
        </div>

        {/* الصورة مع تأثير الزووم عند التمرير */}
        <img 
          src={image} 
          alt={title}
          className="w-full h-full object-cover transition duration-500 group-hover:scale-110 opacity-90 group-hover:opacity-100"
        />
      </div>

      {/* تفاصيل المنتج */}
      <div className="p-4 flex flex-col flex-grow">
        {/* التقييم بالنجوم الذهبية */}
        <div className="flex items-center gap-1 mb-2">
          <svg className="w-4 h-4 text-[#F5C518]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
          <span className="text-sm font-bold text-gray-300">{rating}</span>
        </div>

        {/* العنوان والنوع */}
        <h3 className="text-white font-bold text-base mb-1 group-hover:text-[#F5C518] transition line-clamp-1">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mb-4">{category}</p>

        {/* السعر وزر الإضافة */}
        <div className="mt-auto">
          <div className="text-[#F5C518] font-black text-xl mb-3 tracking-tighter">
            {price} <span className="text-xs font-normal">ر.س</span>
          </div>
          
          <button className="w-full bg-[#2c2c2c] hover:bg-[#333] text-[#5799ef] font-bold py-2.5 rounded transition flex items-center justify-center gap-2 group/btn">
            <span className="text-xl group-hover/btn:scale-125 transition">+</span>
            <span className="text-sm">إضافة للسلة</span>
          </button>
        </div>
      </div>
    </div>
  );
}