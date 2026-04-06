"use client";
import React from 'react';
import dynamic from 'next/dynamic';
import { usePageReady, useGlobalLoader } from "@/context/GlobalLoaderContext";

// Dynamic import for Cloudflare safety
const HomeSectionsMain = dynamic(() => import("@/components/HomeSectionsMain"), { 
  ssr: false 
});

export default function Home() {
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();

  return <HomeSectionsMain />;
}