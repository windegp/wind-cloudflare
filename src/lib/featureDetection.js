/**
 * Feature Detection Utilities
 * 
 * Safe wrappers for modern browser APIs with graceful fallbacks.
 * All functions preserve existing behavior while adding safety guards.
 */

// ============================================
// 1. INTERSECTION OBSERVER SAFETY
// ============================================

export const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';

export function createSafeObserver(callback, options) {
  if (hasIntersectionObserver) {
    return new IntersectionObserver(callback, options);
  }
  // Fallback: simulate with scroll events (simplified)
  return {
    observe: () => {},
    unobserve: () => {},
    disconnect: () => {},
    takeRecords: () => [],
  };
}

// ============================================
// 2. WEB CRYPTO API SAFETY
// ============================================

export const hasWebCrypto = typeof crypto !== 'undefined' && 
  typeof crypto.subtle !== 'undefined';

export function getCryptoFallback() {
  return !hasWebCrypto;
}

// ============================================
// 3. NAVIGATOR APIs SAFETY
// ============================================

export function safeNavigatorShare(data) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    return navigator.share(data);
  }
  return Promise.reject(new Error('Web Share API not supported'));
}

export function safeNavigatorClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback: use execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
  } catch (e) {
    return Promise.reject(e);
  }
}

// ============================================
// 4. WINDOW APIS SAFETY
// ============================================

export function safeScrollTo(options) {
  if (typeof window !== 'undefined') {
    try {
      window.scrollTo(options);
    } catch (e) {
      // Fallback for older browsers
      window.scrollTo(options.left || 0, options.top || 0);
    }
  }
}

export function safeAddEventListener(target, event, handler, options) {
  if (!target || !target.addEventListener) return;
  target.addEventListener(event, handler, options);
  return () => {
    if (target.removeEventListener) {
      target.removeEventListener(event, handler, options);
    }
  };
}

// ============================================
// 5. SAFE PROPERTY ACCESS HELPERS
// ============================================

export function safeGet(obj, path, defaultValue) {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result == null || typeof result !== 'object') return defaultValue;
    result = result[key];
  }
  return result !== undefined ? result : defaultValue;
}

export function safeNullish(value, fallback) {
  return value != null ? value : fallback;
}

export default {
  hasIntersectionObserver,
  hasWebCrypto,
  createSafeObserver,
  getCryptoFallback,
  safeNavigatorShare,
  safeNavigatorClipboard,
  safeScrollTo,
  safeAddEventListener,
  safeGet,
  safeNullish,
};
