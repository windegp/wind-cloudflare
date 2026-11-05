export default function Loading() {
  return (
    <main className="min-h-screen bg-white" dir="rtl">
      <div className="px-4 md:px-8 pt-8 pb-6">
        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-4 w-64 max-w-full bg-gray-100 rounded animate-pulse" />
      </div>

      <div className="px-4 md:px-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-7">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="animate-pulse">
            <div className="aspect-[4/5] bg-[#EFEFEF]" />

            <div className="pt-4 space-y-3">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
              <div className="h-4 w-1/3 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}