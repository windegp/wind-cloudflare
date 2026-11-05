export default function Loading() {
  return (
    <main className="min-h-screen bg-white text-[#111111] pb-16" dir="rtl">
      <div className="px-5 pt-3 pb-5">
        <div className="h-3 w-36 bg-gray-100 rounded animate-pulse" />
      </div>

      <div className="lg:hidden">
        <div className="px-4">
          <div className="aspect-[3/4] w-full bg-[#F7F7F7] animate-pulse" />
        </div>

        <div className="px-5 pt-7 space-y-5">
          <div className="h-6 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
          <div className="h-12 w-full bg-gray-100 rounded animate-pulse mt-6" />
        </div>
      </div>

      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-12 lg:px-12">
        <div className="aspect-[3/4] bg-[#F7F7F7] animate-pulse" />
        <div className="pt-8 space-y-6">
          <div className="h-8 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
          <div className="h-12 w-full bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    </main>
  );
}