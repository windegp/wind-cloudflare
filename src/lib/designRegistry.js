import dynamic from 'next/dynamic';

// --- التحميل الذكي (Dynamic Imports) لضمان أسرع أداء للموقع مستقبلاً ---
const HeroSection = dynamic(() => import("@/components/sections/HeroSection"));
const EditorialCenteredHero = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.EditorialCenteredHero));

const FeaturedToday = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.FeaturedToday));
const TopTenProducts = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.TopTenProducts));
const MarqueeProducts = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.MarqueeProducts));
const BestSellersSection = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.BestSellersSection));
const ExclusiveOffers = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.ExclusiveOffers));
const MasterpieceCollections = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.MasterpieceCollections));
const CircularCollections = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.CircularCollections));

const TopRatedWeekly = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.TopRatedWeekly));
const MostLikedWeekly = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.MostLikedWeekly));
const TopRatedAllTime = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.TopRatedAllTime));
const MostLikedAllTime = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.MostLikedAllTime));
const TabbedHighlights = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.TabbedHighlights));
const BannerProductGrid = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.BannerProductGrid));

const VisualBreakSection = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.VisualBreakSection));
const CustomerReviewsSection = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.CustomerReviewsSection));

// 🔥 استدعاء القسم الجديد
const FloatingCollectionsSection = dynamic(() => import("@/components/sections/HomeSections").then(mod => mod.FloatingCollectionsSection));

export const DESIGN_REGISTRY = {
  "HERO_SECTION": {
    "MODERN_SLIDER": HeroSection, 
    "EDITORIAL_CENTERED": EditorialCenteredHero 
  },
  "FEATURED_SECTION": {
    "IMDB_STYLE": FeaturedToday, 
  },
  "TOP_TEN_SECTION": {
    "TOP_TEN_LIST": TopTenProducts 
  },
  "MARQUEE_SECTION": {
    "PRODUCTS_SLIDER": MarqueeProducts 
  },
  "BEST_SELLERS_SECTION": {
    "BEST_SELLERS_GRID": BestSellersSection 
  },
  "EXCLUSIVE_OFFERS_SECTION": {
    "PREMIUM_CARDS": ExclusiveOffers 
  },
 "COLLECTIONS_SPOTLIGHT": {
    "POSTER_COLLECTIONS": MasterpieceCollections 
  },
  "CIRCULAR_COLLECTIONS": {
    "CIRCULAR_COLLECTIONS_DESIGN": CircularCollections
  },
  "TOP_RATED_WEEKLY_SECTION": {
    "DYNAMIC_RATING_GRID": TopRatedWeekly
  },
  "MOST_LIKED_WEEKLY_SECTION": {
    "DYNAMIC_LIKES_GRID": MostLikedWeekly
  },
  "TOP_RATED_ALL_TIME_SECTION": {
    "DYNAMIC_RATING_GRID_ALL_TIME": TopRatedAllTime
  },
  "MOST_LIKED_ALL_TIME_SECTION": {
    "PREMIUM_GRID_ALL_TIME": MostLikedAllTime
  },
  "TABBED_HIGHLIGHTS_SECTION": {
    "TABBED_TABS_DESIGN": TabbedHighlights
  },
  "BANNER_PRODUCT_GRID_SECTION": {
    "BANNER_EDITORIAL_DESIGN": BannerProductGrid
  },
  "VISUAL_BREAK_SECTION": {
    "DARK_PROMO_DESIGN": VisualBreakSection
  },
  "CUSTOMER_REVIEWS_SECTION": {
    "CUSTOMER_REVIEWS_DESIGN": CustomerReviewsSection
  },
  // 🔥 تسجيل القسم الجديد
  "FLOATING_COLLECTIONS_SECTION": {
    "FLOATING_COLLECTIONS_DESIGN": FloatingCollectionsSection
  }
};