"use client";
import useSWR from 'swr';

const DEFAULT_SWR_CONFIG = {
  dedupingInterval: 120000,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  errorRetryCount: 0,
  keepPreviousData: true
};

export function useSmartSWR(key, fetcher, config = {}) {
  return useSWR(key, fetcher, {
    ...DEFAULT_SWR_CONFIG,
    ...config
  });
}

