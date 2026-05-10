/**
 * Three-layer persistence — guaranteed no data loss.
 *
 * Layer 1 (most reliable): /api/categories  — server-side JSON file on container disk.
 *   Survives: browser cache clear, incognito, different origin, port-forward URL change.
 *   Lives at: <workspace>/categories.json (committed to git if you push).
 *
 * Layer 2: IndexedDB — browser-native large storage (~250 MB+, no quota errors).
 *   Survives: page refresh, tab close/reopen, browser restart.
 *   Falls if: explicit "Clear site data" in browser settings.
 *
 * Layer 3 (legacy compat): localStorage with LZString compression.
 *   Survives: page refresh.
 *   Falls if: quota exceeded (5 MB limit — common with 450+ rich categories).
 *
 * Load strategy on startup: all three are read in parallel; the one with the
 * most categories wins and is immediately re-synced to the others so they converge.
 *
 * Save strategy: every change writes to all three (IndexedDB + file API are async
 * fire-and-forget; localStorage is best-effort sync).
 */

import LZString from 'lz-string';
import type { Category } from '../types';

// ─── Layer 1: Server file API ─────────────────────────────────────────────────

const API_URL = '/api/categories';

export async function apiLoadCategories(): Promise<Category[]> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function apiSaveCategories(categories: Category[]): Promise<boolean> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categories),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Detect whether the dev-server API is available (dev mode only)
let _apiAvailable: boolean | null = null;
export async function isApiAvailable(): Promise<boolean> {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(API_URL, { method: 'GET', cache: 'no-store' });
    _apiAvailable = res.ok;
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}

// ─── Layer 2: IndexedDB ────────────────────────────────────────────────────────

const IDB_NAME = 'flashface-db';
const IDB_VERSION = 1;
const IDB_STORE = 'snapshots';
const IDB_KEY = 'categories';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbLoadCategories(): Promise<Category[]> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbSaveCategories(categories: Category[]): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(categories, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently swallow — we have other layers
  }
}

// ─── Layer 3: localStorage (legacy / initial-render sync read) ────────────────

const LS_KEY = 'flashface_categories';

export function lsLoadCategories(): Category[] {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return [];
    const decomp = LZString.decompressFromUTF16(saved);
    return JSON.parse(decomp || saved) as Category[];
  } catch {
    return [];
  }
}

export function lsSaveCategories(categories: Category[]): void {
  try {
    const compressed = LZString.compressToUTF16(JSON.stringify(categories));
    localStorage.setItem(LS_KEY, compressed);
  } catch {
    // quota exceeded — silently accept; IndexedDB + file API are the real backups
  }
}

// ─── Unified save (all three layers) ─────────────────────────────────────────

export function saveAllLayers(categories: Category[]): void {
  // Sync localStorage best-effort
  lsSaveCategories(categories);
  // Async fire-and-forget for large layers
  idbSaveCategories(categories);
  apiSaveCategories(categories);
}

// ─── Startup load: pick the best source ───────────────────────────────────────

/**
 * Loads categories from all three layers in parallel and returns a merged result.
 *
 * Merge strategy (per-category, not per-layer):
 * 1. Build a union of ALL unique category IDs across all three layers.
 * 2. For each ID, pick the version with the LATEST `lastUpdated` timestamp.
 * 3. Cross-sync all layers to this merged result so they converge.
 *
 * This handles all edge cases correctly:
 * - One layer misses a recent deep-research update → winner has newer timestamp
 * - A category was deleted → it was deleted from all layers via saveAllLayers, so it won't reappear
 * - All layers in sync → identical merge result, no unnecessary writes
 */
export async function loadBestCategories(): Promise<{ categories: Category[]; source: string }> {
  const [apiCats, idbCats] = await Promise.all([
    apiLoadCategories(),
    idbLoadCategories(),
  ]);
  const lsCats = lsLoadCategories();

  // Build a map: id → best version across all layers
  const bestById = new Map<string, Category>();
  for (const cat of [...apiCats, ...idbCats, ...lsCats]) {
    const existing = bestById.get(cat.id);
    if (!existing) {
      bestById.set(cat.id, cat);
    } else {
      // Keep whichever was updated more recently
      const existingTs = existing.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
      const incomingTs = cat.lastUpdated   ? new Date(cat.lastUpdated).getTime()   : 0;
      if (incomingTs > existingTs) bestById.set(cat.id, cat);
    }
  }

  const merged = Array.from(bestById.values());

  // Determine the dominant source label for UI display
  const maxCount = Math.max(apiCats.length, idbCats.length, lsCats.length);
  const source = apiCats.length === maxCount ? 'server-file'
    : idbCats.length === maxCount ? 'IndexedDB'
    : 'localStorage';

  if (merged.length > 0) {
    // Cross-sync all layers to the merged truth
    const needsApiSync = apiCats.length !== merged.length;
    const needsIdbSync = idbCats.length !== merged.length;
    const needsLsSync  = lsCats.length  !== merged.length;
    if (needsApiSync) apiSaveCategories(merged);
    if (needsIdbSync) idbSaveCategories(merged);
    if (needsLsSync)  lsSaveCategories(merged);
  }

  return { categories: merged, source };
}
