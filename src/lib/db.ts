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
import { getSettings } from './settings';

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

// ─── Layer 0: GitHub repository (most durable — survives Codespace rebuilds) ──
//
// Uses the GitHub Contents API to commit categories.json directly to the repo.
// Every save becomes a git commit — full rollback history, zero infrastructure.
// Saves are debounced (8s) so rapid edits don't spam commits.
// Falls back gracefully when no token is configured.

const GH_OWNER = 'dbconcept1';
const GH_REPO  = 'flashface-category';
const GH_PATH  = 'categories.json';
const GH_BRANCH = 'main';
const GH_API   = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
/** Cached file SHA — required by GitHub API to update an existing file. */
const GH_SHA_KEY   = 'flashface_gh_sha';
/** Epoch (timestamp) of last confirmed GitHub save — used in layer comparison. */
const GH_EPOCH_KEY = 'flashface_gh_epoch';

function getGithubToken(): string {
  return getSettings().githubToken || '';
}

/** Encode a UTF-8 string to base64 (browser-safe). */
function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binStr = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
  return btoa(binStr);
}

/** Decode a base64 string to UTF-8 (browser-safe). */
function b64decode(b64: string): string {
  const binStr = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function githubLoadCategories(): Promise<Category[]> {
  const token = getGithubToken();
  if (!token) return [];
  try {
    const res = await fetch(GH_API, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = await res.json();
    // Cache SHA so next save can skip the extra GET round-trip
    if (json.sha) localStorage.setItem(GH_SHA_KEY, json.sha);
    const data = JSON.parse(b64decode(json.content));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function githubSaveCategories(categories: Category[]): Promise<boolean> {
  const token = getGithubToken();
  if (!token) return false;

  const content = b64encode(JSON.stringify(categories, null, 2));
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const buildPayload = (sha?: string) => JSON.stringify({
    message: `data: sync ${categories.length} categories [${ts}]`,
    content,
    branch: GH_BRANCH,
    ...(sha ? { sha } : {}),
  });

  const doPut = (sha?: string) => fetch(GH_API, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: buildPayload(sha),
  });

  try {
    const cachedSha = localStorage.getItem(GH_SHA_KEY) || undefined;
    let res = await doPut(cachedSha);

    // 409 = SHA conflict (stale cached SHA) — re-fetch and retry once
    if (res.status === 409 || res.status === 422) {
      const getRes = await fetch(GH_API, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
      });
      if (!getRes.ok) return false;
      const meta = await getRes.json();
      if (meta.sha) localStorage.setItem(GH_SHA_KEY, meta.sha);
      res = await doPut(meta.sha);
    }

    if (res.ok) {
      const data = await res.json();
      // Cache the fresh SHA returned by the commit so next save skips the GET
      const newSha = data?.content?.sha;
      if (newSha) localStorage.setItem(GH_SHA_KEY, newSha);
      localStorage.setItem(GH_EPOCH_KEY, Date.now().toString());
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Debounce state — at most one GitHub commit per 8 seconds during rapid editing
let _ghTimer: ReturnType<typeof setTimeout> | null = null;
let _ghPending: Category[] | null = null;

function scheduleGithubSave(categories: Category[]): void {
  _ghPending = categories;
  if (_ghTimer) clearTimeout(_ghTimer);
  _ghTimer = setTimeout(() => {
    _ghTimer = null;
    const toSave = _ghPending;
    _ghPending = null;
    if (toSave) githubSaveCategories(toSave); // fire and forget
  }, 8_000);
}

/**
 * Flush any pending debounced GitHub save immediately.
 * Call this in beforeunload so the final state is always committed.
 */
export function flushGithubSave(): void {
  if (_ghTimer) {
    clearTimeout(_ghTimer);
    _ghTimer = null;
  }
  const toSave = _ghPending;
  _ghPending = null;
  if (toSave) githubSaveCategories(toSave); // fire and forget
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

  // Layer 0: GitHub — debounced, runs in background, does not block UI
  scheduleGithubSave(categories);

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
  const [[idbCats, idbEpoch], apiCats, ghCats] = await Promise.all([
    Promise.all([idbLoadCategories(), idbGetEpoch()]),
    apiLoadCategories(),
    githubLoadCategories(),
  ]);
  const lsCats = lsLoadCategories();

  const lsEpoch  = parseInt(localStorage.getItem(LS_EPOCH_KEY)  || '0');
  const apiEpoch = parseInt(localStorage.getItem(API_EPOCH_KEY) || '0');
  const ghEpoch  = parseInt(localStorage.getItem(GH_EPOCH_KEY)  || '0');

  const layers: { cats: Category[]; label: string; epoch: number }[] = [
    { cats: lsCats,  label: 'localStorage', epoch: lsEpoch  },
    { cats: idbCats, label: 'IndexedDB',    epoch: idbEpoch },
    { cats: apiCats, label: 'server-file',  epoch: apiEpoch },
    { cats: ghCats,  label: 'GitHub',       epoch: ghEpoch  },
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
  // Re-sync GitHub immediately (not debounced) if it's lagging — ensures
  // the repo stays up-to-date on Codespace startup after a rebuild.
  if (ghEpoch < bestEpoch || ghCats.length !== merged.length)    githubSaveCategories(merged);

  return { categories: merged, source: primary.label };
}
