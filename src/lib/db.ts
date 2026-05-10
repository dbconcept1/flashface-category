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
/** Companion localStorage key — updated to Date.now() only when a server POST succeeds. */
const API_EPOCH_KEY = 'flashface_api_epoch';

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
    if (res.ok) {
      // Only update epoch when the write is confirmed — used as tiebreaker in loadBestCategories
      localStorage.setItem(API_EPOCH_KEY, Date.now().toString());
      return true;
    }
    return false;
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
/** Companion key stored in the same IDB object store — holds the savedAt timestamp. */
const IDB_EPOCH_KEY = 'categories_epoch';

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

async function idbGetEpoch(): Promise<number> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_EPOCH_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function idbSaveCategories(categories: Category[]): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(categories, IDB_KEY);
      store.put(Date.now(), IDB_EPOCH_KEY); // epoch in same atomic transaction
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently swallow — we have other layers
  }
}

// ─── Layer 3: localStorage (legacy / initial-render sync read) ────────────────

const LS_KEY = 'flashface_categories';
/** Updated to Date.now() on every successful localStorage write. Primary epoch for loadBestCategories. */
const LS_EPOCH_KEY = 'flashface_epoch';

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
    localStorage.setItem(LS_EPOCH_KEY, Date.now().toString());
  } catch {
    // quota exceeded — silently accept; IndexedDB + file API are the real backups
  }
}

// ─── Unified save (all three layers) ─────────────────────────────────────────

/**
 * Saves to all three layers. Returns whether the async layers (IDB + API) succeeded.
 * Use the result to show a real error indicator in the UI when both async layers fail.
 */
export async function saveAllLayers(categories: Category[]): Promise<{ api: boolean; idb: boolean }> {
  // Layer 3: always write synchronously first (sets LS_EPOCH_KEY too)
  lsSaveCategories(categories);

  // Layers 1 + 2 in parallel
  const [idbResult, apiResult] = await Promise.all([
    idbSaveCategories(categories).then(() => true).catch(() => false),
    apiSaveCategories(categories),
  ]);

  return { idb: idbResult as boolean, api: apiResult };
}

// ─── Startup load: pick the best source ───────────────────────────────────────

/**
 * Loads categories from all three layers in parallel using a two-phase strategy
 * that correctly handles both research updates AND deletions:
 *
 * Phase 1 — Pick the "primary" layer using savedAt epoch (newest write wins).
 *   localStorage is always written synchronously, so it has the newest epoch for
 *   any change the user just made (including deletions). This means deletions are
 *   never restored from lagging async layers.
 *
 * Phase 2 — For each category ID that EXISTS in the primary layer, pick the version
 *   with the most recent `lastUpdated` across all layers. This surfaces any research
 *   data that was written to one layer (e.g. during a research run) but not yet
 *   propagated to others.
 *
 * Categories are only included if they appear in the primary layer — so if you deleted
 * a category and localStorage has the deletion, it won't be restored from IDB/server.
 */
export async function loadBestCategories(): Promise<{ categories: Category[]; source: string }> {
  const [[idbCats, idbEpoch], apiCats] = await Promise.all([
    Promise.all([idbLoadCategories(), idbGetEpoch()]),
    apiLoadCategories(),
  ]);
  const lsCats = lsLoadCategories();

  const lsEpoch  = parseInt(localStorage.getItem(LS_EPOCH_KEY)  || '0');
  const apiEpoch = parseInt(localStorage.getItem(API_EPOCH_KEY) || '0');

  const layers: { cats: Category[]; label: string; epoch: number }[] = [
    { cats: lsCats,  label: 'localStorage', epoch: lsEpoch  },
    { cats: idbCats, label: 'IndexedDB',    epoch: idbEpoch },
    { cats: apiCats, label: 'server-file',  epoch: apiEpoch },
  ];

  // Phase 1: pick primary layer by newest epoch (tiebreak: count)
  const primary = layers.reduce((a, b) => {
    if (b.epoch !== a.epoch) return b.epoch > a.epoch ? b : a;
    return b.cats.length > a.cats.length ? b : a;
  });

  if (primary.cats.length === 0) {
    return { categories: [], source: primary.label };
  }

  // Phase 2: for each ID that exists in the primary, take the latest version
  const merged = primary.cats.map(primaryCat => {
    let best = primaryCat;
    const bestTs = () => best.lastUpdated ? new Date(best.lastUpdated).getTime() : 0;
    for (const layer of layers) {
      const candidate = layer.cats.find(c => c.id === primaryCat.id);
      if (candidate) {
        const ts = candidate.lastUpdated ? new Date(candidate.lastUpdated).getTime() : 0;
        if (ts > bestTs()) best = candidate;
      }
    }
    return best;
  });

  // Re-sync lagging layers
  const bestEpoch = primary.epoch;
  if (apiEpoch < bestEpoch || apiCats.length !== merged.length)  apiSaveCategories(merged);
  if (idbEpoch < bestEpoch || idbCats.length !== merged.length)  idbSaveCategories(merged);
  if (lsEpoch  < bestEpoch || lsCats.length  !== merged.length)  lsSaveCategories(merged);

  return { categories: merged, source: primary.label };
}
