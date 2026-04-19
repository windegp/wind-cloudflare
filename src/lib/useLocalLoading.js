"use client";
import { useState, useCallback } from "react";

/**
 * Custom hook for managing local loading states
 * Used for form submissions, button actions, and data fetches within components
 * 
 * Note: GlobalLoader.js handles page-level/initial loading
 * This hook is for local UI feedback (buttons, forms, specific actions)
 * 
 * @example
 * const { isLoading, startLoading, stopLoading } = useLocalLoading();
 * 
 * const handleSubmit = async () => {
 *   startLoading();
 *   try {
 *     await saveData();
 *   } finally {
 *     stopLoading();
 *   }
 * };
 * 
 * return (
 *   <button disabled={isLoading} onClick={handleSubmit}>
 *     {isLoading ? "جاري الحفظ..." : "احفظ"}
 *   </button>
 * );
 */
export function useLocalLoading(initialState = false) {
  const [isLoading, setIsLoading] = useState(initialState);

  const startLoading = useCallback(() => {
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const withLoading = useCallback(async (asyncFn) => {
    startLoading();
    try {
      return await asyncFn();
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  return {
    isLoading,
    setIsLoading,
    startLoading,
    stopLoading,
    withLoading, // Helper for async operations
  };
}

export default useLocalLoading;
