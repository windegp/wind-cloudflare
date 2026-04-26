/**
 * Firestore Write Optimizer
 * 
 * Provides utilities for:
 * - Debounced writes to reduce Firestore write quota
 * - Idempotency checks to prevent duplicate operations
 * - Batch writes for atomic multi-document updates
 * - Write guards to prevent duplicate submissions
 */

// ═══════════════════════════════════════════════════════════
// DEBOUNCE UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Create a debounced function that delays execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(fn, delay = 1000) {
  let timeoutId = null;
  
  return function(...args) {
    if (timeoutId) clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Create a debounced async function with promise handling
 * @param {Function} fn - Async function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced async function
 */
export function debounceAsync(fn, delay = 1000) {
  let timeoutId = null;
  let pendingPromise = null;
  
  return function(...args) {
    if (timeoutId) clearTimeout(timeoutId);
    
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn.apply(this, args);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          timeoutId = null;
        }
      }, delay);
    });
  };
}

/**
 * Net change tracker for debounced operations (like likes)
 * Tracks cumulative changes and only writes the net result
 */
export class NetChangeTracker {
  constructor() {
    this.pending = 0;
  }

  increment(amount = 1) {
    this.pending += amount;
  }

  decrement(amount = 1) {
    this.pending -= amount;
  }

  getNet() {
    return this.pending;
  }

  reset() {
    this.pending = 0;
  }

  /**
   * Execute write only if net change is non-zero
   * @param {Function} writeFn - Write function to execute
   * @param {number} netChange - The net change to write
   */
  async writeIfChanged(writeFn, netChange) {
    if (netChange === 0) return null;
    
    try {
      const result = await writeFn(netChange);
      this.reset();
      return result;
    } catch (error) {
      console.error('[NetChangeTracker] Write failed:', error);
      throw error;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// IDEMPOTENCY UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Generate a unique operation ID for idempotency
 * @param {string} operationType - Type of operation (e.g., 'order', 'payment')
 * @param {string} identifier - Unique identifier (e.g., order ID, customer email)
 * @returns {string} - Unique operation ID
 */
export function generateOperationId(operationType, identifier) {
  return `${operationType}_${identifier}_${Date.now()}`;
}

/**
 * Check if an operation has already been executed (idempotency check)
 * Uses KV storage for cross-tab/reload persistence
 * @param {string} operationId - Unique operation ID
 * @returns {Promise<boolean>} - true if operation was already executed
 */
export async function isOperationExecuted(operationId) {
  try {
    // Try unified write-ops API first (server-side persistence)
    const res = await fetch('/api/write-ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'idempotency_check', operationId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.executed) return true;
    }
  } catch (error) {
    console.warn('[Idempotency] KV check failed, falling back to localStorage:', error);
  }
  
  // Fallback to localStorage (per-tab)
  try {
    if (typeof window === 'undefined') return false;
    const executedOps = JSON.parse(localStorage.getItem('wind_executed_ops') || '{}');
    const opData = executedOps[operationId];
    if (opData) {
      // Check if expired
      if (opData.expiresAt && opData.expiresAt < Date.now()) {
        delete executedOps[operationId];
        localStorage.setItem('wind_executed_ops', JSON.stringify(executedOps));
        return false;
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Mark an operation as executed (idempotency)
 * Stores in KV for cross-tab/reload persistence and localStorage as fallback
 * @param {string} operationId - Unique operation ID
 * @param {number} ttlMs - Time to live in milliseconds (default: 10 minutes)
 */
export async function markOperationExecuted(operationId, ttlMs = 600000) {
  // Store in unified write-ops API (server-side persistence)
  try {
    await fetch('/api/write-ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'idempotency_mark', operationId, ttlMs })
    });
  } catch (error) {
    console.warn('[Idempotency] KV mark failed, using localStorage fallback:', error);
  }
  
  // Fallback to localStorage (per-tab)
  try {
    if (typeof window === 'undefined') return;
    
    const executedOps = JSON.parse(localStorage.getItem('wind_executed_ops') || '{}');
    executedOps[operationId] = {
      executedAt: Date.now(),
      expiresAt: Date.now() + ttlMs
    };
    
    localStorage.setItem('wind_executed_ops', JSON.stringify(executedOps));
  } catch (error) {
    console.error('[Idempotency] Failed to mark operation in localStorage:', error);
  }
}

/**
 * Clean up expired operation records
 */
export function cleanupExpiredOperations() {
  try {
    if (typeof window === 'undefined') return;
    
    const executedOps = JSON.parse(localStorage.getItem('wind_executed_ops') || '{}');
    const now = Date.now();
    let hasChanges = false;
    
    for (const [opId, data] of Object.entries(executedOps)) {
      if (data.expiresAt && data.expiresAt < now) {
        delete executedOps[opId];
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      localStorage.setItem('wind_executed_ops', JSON.stringify(executedOps));
    }
  } catch (error) {
    console.error('[Idempotency] Failed to cleanup:', error);
  }
}

/**
 * Execute an operation with idempotency check
 * @param {string} operationId - Unique operation ID
 * @param {Function} operationFn - Operation function to execute
 * @param {number} ttlMs - Time to live for idempotency record (default: 10 minutes)
 * @returns {Promise<any>} - Operation result
 */
export async function executeWithIdempotency(operationId, operationFn, ttlMs = 600000) {
  // Check if already executed
  const alreadyExecuted = await isOperationExecuted(operationId);
  if (alreadyExecuted) {
    console.log('[Idempotency] Operation already executed:', operationId);
    return null;
  }
  
  try {
    const result = await operationFn();
    
    // Mark as executed on success
    await markOperationExecuted(operationId, ttlMs);
    
    return result;
  } catch (error) {
    console.error('[Idempotency] Operation failed:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// WRITE GUARD (Duplicate Submission Prevention)
// ═══════════════════════════════════════════════════════════

/**
 * Write guard to prevent duplicate submissions
 * Uses localStorage for cross-tab persistence and KV for server-side validation
 */
export class WriteGuard {
  constructor() {
    this.storageKey = 'wind_write_guard';
  }

  /**
   * Check if a write operation is in progress (cross-tab check)
   * @param {string} key - Unique key for the operation
   * @returns {Promise<boolean>}
   */
  async isInProgress(key) {
    try {
      // Check localStorage first (cross-tab persistence)
      if (typeof window !== 'undefined') {
        const guardData = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        const entry = guardData[key];
        
        if (entry) {
          // Check if entry is stale (older than 5 minutes)
          if (Date.now() - entry.timestamp > 300000) {
            await this.release(key);
            return false;
          }
          return true;
        }
      }
      
      // Check unified write-ops API for server-side validation (stronger cross-tab protection)
      try {
        const res = await fetch('/api/write-ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'write_guard_check', key })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.inProgress) return true;
        }
      } catch (error) {
        console.warn('[WriteGuard] KV check failed:', error);
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Acquire write guard for an operation (cross-tab)
   * @param {string} key - Unique key for the operation
   * @returns {Promise<boolean>} - true if guard was acquired
   */
  async acquire(key) {
    try {
      // Check if already in progress
      const alreadyInProgress = await this.isInProgress(key);
      if (alreadyInProgress) {
        console.warn('[WriteGuard] Operation already in progress:', key);
        return false;
      }
      
      // Store in localStorage (cross-tab persistence)
      if (typeof window !== 'undefined') {
        const guardData = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        guardData[key] = { timestamp: Date.now() };
        localStorage.setItem(this.storageKey, JSON.stringify(guardData));
      }
      
      // Store in unified write-ops API for server-side validation
      try {
        await fetch('/api/write-ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'write_guard_acquire', key, ttl: 300 }) // 5 minutes TTL
        });
      } catch (error) {
        console.warn('[WriteGuard] KV acquire failed:', error);
      }
      
      return true;
    } catch (error) {
      console.error('[WriteGuard] Failed to acquire guard:', error);
      return false;
    }
  }

  /**
   * Release write guard for an operation (cross-tab)
   * @param {string} key - Unique key for the operation
   */
  async release(key) {
    try {
      // Clear from localStorage
      if (typeof window !== 'undefined') {
        const guardData = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        delete guardData[key];
        localStorage.setItem(this.storageKey, JSON.stringify(guardData));
      }
      
      // Clear from unified write-ops API
      try {
        await fetch('/api/write-ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'write_guard_release', key })
        });
      } catch (error) {
        console.warn('[WriteGuard] KV release failed:', error);
      }
    } catch (error) {
      console.error('[WriteGuard] Failed to release guard:', error);
    }
  }

  /**
   * Execute operation with write guard (cross-tab protection)
   * @param {string} key - Unique key for the operation
   * @param {Function} operationFn - Operation function to execute
   * @returns {Promise<any>} - Operation result or null if guard not acquired
   */
  async execute(key, operationFn) {
    if (!(await this.acquire(key))) {
      console.warn('[WriteGuard] Duplicate submission prevented:', key);
      return null;
    }
    
    try {
      const result = await operationFn();
      return result;
    } catch (error) {
      console.error('[WriteGuard] Operation failed:', error);
      throw error;
    } finally {
      await this.release(key);
    }
  }
}

// Global write guard instance
export const writeGuard = new WriteGuard();

// ═══════════════════════════════════════════════════════════
// BATCH WRITE UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Execute a batch of Firestore writes atomically
 * Uses Firestore writeBatch which guarantees atomicity:
 * - All writes succeed or none succeed
 * - Maximum 500 operations per batch
 * @param {Object} db - Firestore database instance
 * @param {Array} writes - Array of write operations
 * @returns {Promise<void>}
 * 
 * Write operation format:
 * {
 *   type: 'set' | 'update' | 'delete',
 *   ref: DocumentReference,
 *   data: Object (for set/update)
 * }
 */
export async function executeBatchWrites(db, writes) {
  const { writeBatch } = await import('firebase/firestore/lite');
  
  if (writes.length > 500) {
    throw new Error('[BatchWrites] Maximum 500 operations per batch allowed');
  }
  
  const batch = writeBatch(db);
  
  writes.forEach(write => {
    switch (write.type) {
      case 'set':
        batch.set(write.ref, write.data, { merge: write.merge || false });
        break;
      case 'update':
        batch.update(write.ref, write.data);
        break;
      case 'delete':
        batch.delete(write.ref);
        break;
      default:
        console.warn('[BatchWrites] Unknown write type:', write.type);
    }
  });
  
  await batch.commit();
}

/**
 * Helper for order + customer + counters batch write
 * @param {Object} db - Firestore database instance
 * @param {Object} orderData - Order document data
 * @param {Object} customerData - Customer document data
 * @param {Object} counterData - Counter document data (optional)
 * @returns {Promise<void>}
 */
export async function batchCreateOrder(db, orderData, customerData, counterData = null) {
  const { doc, updateDoc, increment } = await import('firebase/firestore/lite');
  
  const writes = [
    {
      type: 'set',
      ref: doc(db, 'Orders', orderData.Name),
      data: orderData,
      merge: true
    },
    {
      type: 'set',
      ref: doc(db, 'Customers', customerData._id || customerData.Email || customerData.Phone),
      data: customerData,
      merge: true
    }
  ];
  
  if (counterData) {
    // Counters are stored in settings/siteSettings, not a separate Counters collection
    // Use update instead of set for counters to properly handle increment
    writes.push({
      type: 'update',
      ref: doc(db, 'settings', 'siteSettings'),
      data: counterData
    });
  }
  
  await executeBatchWrites(db, writes);
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOT COMPARISON (for debouncing based on data changes)
// ═══════════════════════════════════════════════════════════

/**
 * Create a snapshot string for comparison
 * @param {Object} data - Data to snapshot
 * @param {Array} fields - Fields to include in snapshot
 * @returns {string} - Snapshot string
 */
export function createSnapshot(data, fields) {
  const snapshot = {};
  fields.forEach(field => {
    snapshot[field] = data[field];
  });
  return JSON.stringify(snapshot);
}

/**
 * Compare two snapshots
 * @param {string} snapshot1 - First snapshot
 * @param {string} snapshot2 - Second snapshot
 * @returns {boolean} - true if snapshots are different
 */
export function hasSnapshotChanged(snapshot1, snapshot2) {
  return snapshot1 !== snapshot2;
}

// Auto-cleanup expired operations on module load
if (typeof window !== 'undefined') {
  cleanupExpiredOperations();
}
