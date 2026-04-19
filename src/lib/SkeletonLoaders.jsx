"use client";

/**
 * Skeleton Loader Components for Premium UX
 * Use while data is loading to prevent layout shifts
 * Automatically hidden when GlobalLoader recedes (pageReady signal)
 * 
 * Example:
 * const { isVisible: loaderVisible } = useGlobalLoader();
 * return (
 *   <>
 *     {loaderVisible ? <SkeletonGrid /> : <ProductGrid />}
 *   </>
 * );
 */

export function SkeletonGrid({ columns = 4, rows = 3 }) {
  const items = Array.from({ length: columns * rows });
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
      {items.map((_, idx) => (
        <SkeletonCard key={idx} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Image skeleton */}
      <div className="aspect-square bg-gray-700 rounded-lg"></div>
      
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
      
      {/* Price skeleton */}
      <div className="h-5 bg-gray-600 rounded w-1/3"></div>
      
      {/* Button skeleton */}
      <div className="h-10 bg-[#F5C518]/20 rounded-lg"></div>
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div className="w-full h-96 bg-gray-700 rounded-lg animate-pulse mb-16"></div>
  );
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className={`h-4 bg-gray-700 rounded animate-pulse ${
            idx === lines - 1 ? "w-3/4" : "w-full"
          }`}
        ></div>
      ))}
    </div>
  );
}
