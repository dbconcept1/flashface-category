/**
 * Brain OS — Three-layer persistence (mirrors the db.ts pattern for categories).
 *
 * Layer 1: /api/brain  — server-side brain.json on container disk (survives browser clear)
 * Layer 2: IndexedDB   — 'flashface_brain' store (survives page reload, ~250 MB)
 * Layer 3: localStorage 'flashface_brain' — instant sync-read on startup
 *
 * Load strategy: all three read in parallel; whichever has the most entries wins,
 * is immediately re-synced to the others so they converge.
 *
 * Save strategy: every change writes to all three simultaneously.
 */

import type { BrainEntry } from '../types';

// ─── Layer 1: Server file ─────────────────────────────────────────────────────

const API_URL = '/api/brain';
const API_EPOCH_KEY = 'flashface_brain_api_epoch';

export async function apiLoadBrain(): Promise<BrainEntry[]> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function apiSaveBrain(entries: BrainEntry[]): Promise<boolean> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    });
    if (res.ok) {
      localStorage.setItem(API_EPOCH_KEY, Date.now().toString());
      return true;
    }
    return false;
  } catch { return false; }
}

// ─── Layer 2: IndexedDB ───────────────────────────────────────────────────────

const IDB_NAME    = 'flashface_brain_db';
const IDB_STORE   = 'brain';
const IDB_VERSION = 1;
const IDB_KEY     = 'entries';

function openBrainIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbSaveBrain(entries: BrainEntry[]): Promise<boolean> {
  try {
    const db  = await openBrainIdb();
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const st  = tx.objectStore(IDB_STORE);
    st.put(entries, IDB_KEY);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res(true);
      tx.onerror    = () => rej(false);
    });
  } catch { return false; }
}

export async function idbLoadBrain(): Promise<BrainEntry[]> {
  try {
    const db = await openBrainIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const st = tx.objectStore(IDB_STORE);
    return new Promise((resolve) => {
      const req = st.get(IDB_KEY);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror   = () => resolve([]);
    });
  } catch { return []; }
}

// ─── Layer 3: localStorage ────────────────────────────────────────────────────

const LS_KEY = 'flashface_brain';

export function lsSaveBrain(entries: BrainEntry[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries)); } catch { /* quota */ }
}

export function lsLoadBrain(): BrainEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

// ─── Combined save (all three layers simultaneously) ─────────────────────────

export async function saveBrainAllLayers(entries: BrainEntry[]): Promise<{ api: boolean; idb: boolean }> {
  lsSaveBrain(entries); // sync first — instant
  const [api, idb] = await Promise.all([apiSaveBrain(entries), idbSaveBrain(entries)]);
  return { api, idb };
}

// ─── Combined load (best-wins merge) ─────────────────────────────────────────

export async function loadBestBrain(): Promise<{ entries: BrainEntry[]; source: string }> {
  const [lsEntries, apiEntries, idbEntries] = await Promise.all([
    Promise.resolve(lsLoadBrain()),
    apiLoadBrain(),
    idbLoadBrain(),
  ]);

  const candidates = [
    { entries: lsEntries,  label: 'localStorage' },
    { entries: apiEntries, label: 'server file'  },
    { entries: idbEntries, label: 'IndexedDB'    },
  ];

  // Winner = most entries (most data = most recent meaningful save)
  const best = candidates.reduce((a, b) => b.entries.length > a.entries.length ? b : a);
  return { entries: best.entries, source: best.label };
}
