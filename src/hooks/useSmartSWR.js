"use client";
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { buildScopedSWRKey, getSWRNamespaceFromPath, serializeSWRKey } from '@/lib/swr-keys';

const DEFAULT_SWR_CONFIG = {
  dedupingInterval: 120000,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  errorRetryCount: 0,
  keepPreviousData: true
};

export function useSmartSWR(key, fetcher, config = {}) {
  const pathname = usePathname();
  const { owner, ...restConfig } = config;
  const scopedKey = buildScopedSWRKey(key, pathname);
  const namespace = getSWRNamespaceFromPath(pathname);

  return useSWR(scopedKey, fetcher, {
    ...DEFAULT_SWR_CONFIG,
    ...restConfig,
    meta: {
      ...(restConfig.meta || {}),
      ...(owner ? { owner } : {}),
      namespace,
      route: pathname || 'unknown-route',
      rawKey: serializeSWRKey(key),
      scopedKey,
    }
  });
}
