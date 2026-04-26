/**
 * Firestore Quota Protection & Logging Utility
 * 
 * This module provides:
 * 1. Read operation counting and logging
 * 2. KV-first pattern enforcement
 * 3. Maximum query limit enforcement (20 documents)
 * 4. Detection of multiple reads per render
 */

import { kvGet, kvSet, kvDelete, TTL, kvFirstFetch, CACHE_PRIORITY } from './kv-cache';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const MAX_QUERY_LIMIT = 20; // Hard limit for all collection queries
const READ_LOG_KEY = 'wind_firestore_reads';
const WARN_THRESHOLD = 2; // Warn if more than 2 reads per function
const CACHE_VERSION = 'v2'; // Version for all cache keys

// Quota alert thresholds (reads per minute)
const QUOTA_ALERT_THRESHOLDS = {
  WARNING: 50,   // Yellow alert - 50 reads/min
  CRITICAL: 100, // Red alert - 100 reads/min
  EMERGENCY: 200 // Immediate action required
};

// Alert cool-down periods (in milliseconds)
const ALERT_COOLDOWN = {
  WARNING: 60000,    // 1 minute between warnings
  CRITICAL: 300000,  // 5 minutes between critical alerts
  EMERGENCY: 900000  // 15 minutes between emergency alerts
};

// Track last alert times to prevent spam
const lastAlerts = {
  warning: 0,
  critical: 0,
  emergency: 0
};

// ═══════════════════════════════════════════════════════════
// READ TRACKING & LOGGING
// ═══════════════════════════════════════════════════════════

// In-memory read tracking for current minute
const currentMinuteReads = [];
let currentMinute = Math.floor(Date.now() / 60000);

/**
 * Logs a Firestore read operation
 * @param {string} functionName - Name of the function performing the read
 * @param {string} collection - Collection being read
 * @param {number} docCount - Number of documents read
 * @param {string} source - 'cache' or 'firestore'
 */
export function logRead(functionName, collection, docCount = 1, source = 'firestore') {
  const now = Date.now();
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    function: functionName,
    collection,
    docCount,
    source
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    const icon = source === 'cache' ? '⚡' : '🔥';
    const staleIndicator = source === 'cache-stale' ? '📦[STALE]' : '';
    console.log(`${icon}${staleIndicator} [${functionName}] ${collection}: ${docCount} docs (${source})`);
  }

  // Track reads for quota monitoring (only Firestore reads, not cache)
  if (source === 'firestore') {
    const thisMinute = Math.floor(now / 60000);
    
    // Reset if we're in a new minute
    if (thisMinute !== currentMinute) {
      currentMinuteReads.length = 0;
      currentMinute = thisMinute;
    }
    
    currentMinuteReads.push({
      timestamp: now,
      function: functionName,
      collection,
      docCount
    });
    
    // Check for quota spikes immediately
    checkQuotaSpike();
  }

  // Store in sessionStorage for audit
  if (typeof window !== 'undefined') {
    try {
      const existing = JSON.parse(sessionStorage.getItem(READ_LOG_KEY) || '[]');
      existing.push(logEntry);
      // Keep last 100 entries
      if (existing.length > 100) existing.shift();
      sessionStorage.setItem(READ_LOG_KEY, JSON.stringify(existing));
    } catch (e) {
      // Ignore storage errors
    }
  }
}

/**
 * Checks if a function has exceeded the read threshold
 * @param {string} functionName - Function to check
 * @returns {boolean} - True if exceeded
 */
export function checkReadThreshold(functionName) {
  if (typeof window === 'undefined') return false;
  
  try {
    const existing = JSON.parse(sessionStorage.getItem(READ_LOG_KEY) || '[]');
    const functionReads = existing.filter(r => r.function === functionName);
    
    if (functionReads.length > WARN_THRESHOLD) {
      console.warn(`⚠️ [QUOTA WARNING] ${functionName} has performed ${functionReads.length} reads. Consider using KV cache.`);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Checks for quota spikes and triggers alerts
 */
function checkQuotaSpike() {
  const totalReadsThisMinute = currentMinuteReads.reduce((sum, r) => sum + r.docCount, 0);
  const now = Date.now();
  
  // Emergency alert - 200+ reads/min
  if (totalReadsThisMinute >= QUOTA_ALERT_THRESHOLDS.EMERGENCY) {
    if (now - lastAlerts.emergency > ALERT_COOLDOWN.EMERGENCY) {
      lastAlerts.emergency = now;
      console.error(`🚨 [QUOTA EMERGENCY] ${totalReadsThisMinute} Firestore reads in current minute! Immediate action required.`);
      console.error(`📊 Top collections:`, getTopCollectionsThisMinute());
      
      // Log to console as error for monitoring systems to catch
      console.error('WIND_QUOTA_EMERGENCY', {
        reads: totalReadsThisMinute,
        timestamp: new Date().toISOString(),
        breakdown: getTopCollectionsThisMinute()
      });
    }
    return;
  }
  
  // Critical alert - 100+ reads/min
  if (totalReadsThisMinute >= QUOTA_ALERT_THRESHOLDS.CRITICAL) {
    if (now - lastAlerts.critical > ALERT_COOLDOWN.CRITICAL) {
      lastAlerts.critical = now;
      console.warn(`⚠️ [QUOTA CRITICAL] ${totalReadsThisMinute} Firestore reads in current minute! Approaching danger zone.`);
      console.warn(`📊 Top collections:`, getTopCollectionsThisMinute());
      console.warn(`💡 Tip: Consider increasing cache TTL or implementing pagination.`);
    }
    return;
  }
  
  // Warning alert - 50+ reads/min
  if (totalReadsThisMinute >= QUOTA_ALERT_THRESHOLDS.WARNING) {
    if (now - lastAlerts.warning > ALERT_COOLDOWN.WARNING) {
      lastAlerts.warning = now;
      console.warn(`⚡ [QUOTA WARNING] ${totalReadsThisMinute} Firestore reads in current minute. Monitor closely.`);
    }
  }
}

/**
 * Gets top collections by read count for current minute
 */
function getTopCollectionsThisMinute() {
  const byCollection = {};
  currentMinuteReads.forEach(r => {
    byCollection[r.collection] = (byCollection[r.collection] || 0) + r.docCount;
  });
  
  return Object.entries(byCollection)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((acc, [col, count]) => {
      acc[col] = count;
      return acc;
    }, {});
}

/**
 * Gets real-time quota status
 */
export function getQuotaStatus() {
  const totalReadsThisMinute = currentMinuteReads.reduce((sum, r) => sum + r.docCount, 0);
  const timeInMinute = (Date.now() % 60000) / 1000;
  
  let status = 'healthy';
  if (totalReadsThisMinute >= QUOTA_ALERT_THRESHOLDS.EMERGENCY) status = 'emergency';
  else if (totalReadsThisMinute >= QUOTA_ALERT_THRESHOLDS.CRITICAL) status = 'critical';
  else if (totalReadsThisMinute >= QUOTA_ALERT_THRESHOLDS.WARNING) status = 'warning';
  
  return {
    status,
    readsThisMinute: totalReadsThisMinute,
    readsPerSecond: (totalReadsThisMinute / timeInMinute).toFixed(2),
    projectedHourly: (totalReadsThisMinute * (60 / (timeInMinute / 60))).toFixed(0),
    thresholds: QUOTA_ALERT_THRESHOLDS,
    topCollections: getTopCollectionsThisMinute()
  };
}

/**
 * Gets read statistics for the current session
 */
export function getReadStats() {
  if (typeof window === 'undefined') return { total: 0, byCollection: {}, byFunction: {} };
  
  try {
    const logs = JSON.parse(sessionStorage.getItem(READ_LOG_KEY) || '[]');
    const firestoreLogs = logs.filter(l => l.source === 'firestore');
    
    return {
      total: firestoreLogs.reduce((sum, l) => sum + l.docCount, 0),
      cacheHits: logs.filter(l => l.source === 'cache' || l.source === 'cache-stale').length,
      cacheStale: logs.filter(l => l.source === 'cache-stale').length,
      byCollection: firestoreLogs.reduce((acc, l) => {
        acc[l.collection] = (acc[l.collection] || 0) + l.docCount;
        return acc;
      }, {}),
      byFunction: firestoreLogs.reduce((acc, l) => {
        acc[l.function] = (acc[l.function] || 0) + l.docCount;
        return acc;
      }, {}),
      quotaStatus: getQuotaStatus()
    };
  } catch (e) {
    return { total: 0, byCollection: {}, byFunction: {} };
  }
}

// ═══════════════════════════════════════════════════════════
// KV-FIRST FETCH PATTERN
// ═══════════════════════════════════════════════════════════

/**
 * Fetches a single document with KV-first pattern
 * @param {string} cacheKey - KV cache key
 * @param {Function} fetchFn - Async function to fetch from Firestore
 * @param {string} functionName - For logging
 * @param {string} collectionName - For logging
 * @returns {Promise<{data: any, source: string}>}
 */
export async function kvFirstFetchWithLog(cacheKey, fetchFn, functionName, collectionName, ttl = TTL.ADMIN_MEDIUM) {
  // Use the improved kvFirstFetch from kv-cache with stampede protection
  const result = await kvFirstFetch(cacheKey, fetchFn, ttl);
  
  // Log the read
  if (result.source === 'cache') {
    logRead(functionName, collectionName, 1, 'cache');
  } else {
    logRead(functionName, collectionName, 1, 'firestore');
    checkReadThreshold(functionName);
  }
  
  return result;
}

/**
 * Fetches a collection with KV-first pattern and enforced limit
 * @param {string} cacheKey - KV cache key
 * @param {Function} fetchFn - Async function that returns {docs: [], hasMore: boolean}
 * @param {string} functionName - For logging
 * @param {string} collectionName - For logging
 * @param {number} limit - Max documents (default: 20, max: 20)
 * @returns {Promise<{docs: any[], hasMore: boolean, source: string}>}
 */
export async function kvFirstFetchCollection(cacheKey, fetchFn, functionName, collectionName, limit = 20) {
  // Enforce hard limit
  const enforcedLimit = Math.min(limit, MAX_QUERY_LIMIT);
  
  // 1. Try KV cache first
  const cached = await kvGet(cacheKey);
  if (cached && Array.isArray(cached.docs)) {
    logRead(functionName, collectionName, cached.docs.length, 'cache');
    return { ...cached, source: 'cache' };
  }

  // 2. Fetch from Firestore
  const result = await fetchFn(enforcedLimit);
  
  // Validate limit wasn't exceeded
  if (result.docs && result.docs.length > MAX_QUERY_LIMIT) {
    console.warn(`⚠️ [LIMIT EXCEEDED] ${functionName} returned ${result.docs.length} docs. Truncating to ${MAX_QUERY_LIMIT}.`);
    result.docs = result.docs.slice(0, MAX_QUERY_LIMIT);
  }
  
  // 3. Store in KV if successful with TTL
  if (result.docs) {
    await kvSet(cacheKey, result, TTL.ADMIN_MEDIUM);
  }
  
  logRead(functionName, collectionName, result.docs?.length || 0, 'firestore');
  checkReadThreshold(functionName);
  
  return { ...result, source: 'firestore' };
}

// ═══════════════════════════════════════════════════════════
// ADMIN-SPECIFIC FETCH (NO CACHE)
// ═══════════════════════════════════════════════════════════

/**
 * Fetches for admin pages (no KV cache, but with logging and limit enforcement)
 * @param {Function} fetchFn - Async fetch function
 * @param {string} functionName - For logging
 * @param {string} collectionName - For logging
 * @param {number} limit - Max documents (default: 20)
 * @returns {Promise<any>}
 */
export async function adminFetch(fetchFn, functionName, collectionName, limit = 20) {
  const enforcedLimit = Math.min(limit, MAX_QUERY_LIMIT);
  
  const result = await fetchFn(enforcedLimit);
  
  // Log collection reads
  const docCount = Array.isArray(result) ? result.length : 
                   result.docs ? result.docs.length : 1;
  
  logRead(functionName, collectionName, docCount, 'firestore');
  checkReadThreshold(functionName);
  
  return result;
}

// ═══════════════════════════════════════════════════════════
// QUERY LIMIT ENFORCEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Enforces maximum query limit on any query constraints array
 * @param {Array} constraints - Firestore query constraints
 * @returns {Array} - Modified constraints with enforced limit
 */
export function enforceQueryLimit(constraints) {
  const hasLimit = constraints.some(c => c.type === 'limit');
  
  if (!hasLimit) {
    // Add default limit if none exists
    const { limit } = require('firebase/firestore/lite');
    constraints.push(limit(MAX_QUERY_LIMIT));
  } else {
    // Replace existing limit if exceeds max
    constraints = constraints.map(c => {
      if (c.type === 'limit' && c._data && c._data > MAX_QUERY_LIMIT) {
        const { limit } = require('firebase/firestore/lite');
        return limit(MAX_QUERY_LIMIT);
      }
      return c;
    });
  }
  
  return constraints;
}

// ═══════════════════════════════════════════════════════════
// REACT HOOK FOR READ TRACKING
// ═══════════════════════════════════════════════════════════

/**
 * Hook to track reads in a component
 * @param {string} componentName - Name for logging
 * @returns {{trackRead: Function, stats: Object}}
 */
export function useReadTracker(componentName) {
  const readsRef = useRef([]);
  
  const trackRead = (collection, docCount = 1, source = 'firestore') => {
    logRead(componentName, collection, docCount, source);
    readsRef.current.push({ collection, docCount, source, time: Date.now() });
    
    if (readsRef.current.length > WARN_THRESHOLD) {
      console.warn(`⚠️ [${componentName}] Multiple reads detected: ${readsRef.current.length}`);
    }
  };
  
  const getStats = () => ({
    total: readsRef.current.length,
    firestoreReads: readsRef.current.filter(r => r.source === 'firestore').length,
    cacheHits: readsRef.current.filter(r => r.source === 'cache').length
  });
  
  return { trackRead, stats: getStats() };
}

// ═══════════════════════════════════════════════════════════
// VERSION HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Returns a versioned cache key
 * @param {string} baseKey - Base cache key
 * @returns {string} - Versioned key
 */
export function getVersionedKey(baseKey) {
  return `${baseKey}_${CACHE_VERSION}`;
}

/**
 * Returns cache version for external use
 */
export function getCacheVersion() {
  return CACHE_VERSION;
}
