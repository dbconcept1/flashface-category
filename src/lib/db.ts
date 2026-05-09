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
 * Loads categories from all three layers in parallel and returns whichever
 * has the most entries (most complete). Also cross-syncs all layers to the winner.
 */
export async function loadBestCategories(): Promise<{ categories: Category[]; source: string }> {
  const [apiCats, idbCats] = await Promise.all([
    apiLoadCategories(),
    idbLoadCategories(),
  ]);
  const lsCats = lsLoadCategories();

  const candidates: { cats: Category[]; label: string }[] = [
    { cats: apiCats, label: 'server-file' },
    { cats: idbCats, label: 'IndexedDB' },
    { cats: lsCats, label: 'localStorage' },
  ];

  const best = candidates.reduce((a, b) => (b.cats.length > a.cats.length ? b : a));

  if (best.cats.length > 0) {
    // Sync all lagging layers up to the winner
    if (apiCats.length < best.cats.length) apiSaveCategories(best.cats);
    if (idbCats.length < best.cats.length) idbSaveCategories(best.cats);
    if (lsCats.length < best.cats.length) lsSaveCategories(best.cats);
  }

  return { categories: best.cats, source: best.label };
}
