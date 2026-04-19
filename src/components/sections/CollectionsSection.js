export default function CollectionsSection() {
  const collections = [
    { title: "هوديز", count: "5 قطع", img: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500" },
    { title: "جاكيتات", count: "2 قطعة", img: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=500" },
    { title: "بلوفرات", count: "11 قطعة", img: "https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?w=500" },
  ];

  return (
    <section className="max-w-[1280px] mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {collections.map((col, index) => (
          <div key={index} className="relative h-64 rounded-lg overflow-hidden group cursor-pointer border border-[#333]">
            <img src={col.img} className="w-full h-full object-cover transition duration-700 group-hover:scale-110 opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
            <div className="absolute bottom-6 right-6 text-right">
                <h3 className="text-2xl font-black text-white">{col.title}</h3>
                <p className="text-[#F5C518] text-sm font-bold">{col.count}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}