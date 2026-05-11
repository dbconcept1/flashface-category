/**
 * conversationDb.ts — 3-layer persistence for BrainConversation[]
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 1: localStorage          — synchronous, immediate, survives page reload
 * Layer 2: IndexedDB             — larger quota, survives localStorage wipe
 * Layer 3: server-side JSON file — survives browser storage clear, survives
 *                                  dev environment wipe (committed to workspace)
 *
 * Read strategy  → load from all 3, return whichever has the most conversations.
 * Write strategy → write all 3 simultaneously; LS is synchronous so always first.
 *
 * NOTE: GitHub sync is NOT included for conversations — conversations can be large
 * and are purely local. The server JSON file is the primary durable backup.
 */

import type { BrainConversation } from '../types';

const LS_KEY  = 'flashface_conversations';
const IDB_DB  = 'flashface_convs_db';
const IDB_VER = 1;
const IDB_ST  = 'conversations';
const IDB_KEY = 'conversations_data';
const API_URL = '/api/conversations';

// ─── Layer 3: Server API ──────────────────────────────────────────────────────

export async function apiLoadConversations(): Promise<BrainConversation[]> {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) return [];
    const data = await res.json() as { conversations?: BrainConversation[] };
    return Array.isArray(data.conversations) ? data.conversations : [];
  } catch {
    return [];
  }
}

export async function apiSaveConversations(conversations: BrainConversation[]): Promise<boolean> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversations }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Layer 2: IndexedDB ───────────────────────────────────────────────────────

function openConvsIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, IDB_VER);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_ST)) {
        req.result.createObjectStore(IDB_ST);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbSaveConversations(conversations: BrainConversation[]): Promise<boolean> {
  try {
    const db = await openConvsIdb();
    return new Promise((resolve) => {
      const tx   = db.transaction(IDB_ST, 'readwrite');
      const store = tx.objectStore(IDB_ST);
      store.put(conversations, IDB_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function idbLoadConversations(): Promise<BrainConversation[]> {
  try {
    const db = await openConvsIdb();
    return new Promise((resolve) => {
      const tx    = db.transaction(IDB_ST, 'readonly');
      const store = tx.objectStore(IDB_ST);
      const req   = store.get(IDB_KEY);
      req.onsuccess = () => {
        const data = req.result as BrainConversation[] | undefined;
        resolve(Array.isArray(data) ? data : []);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// ─── Layer 1: localStorage ────────────────────────────────────────────────────

export function lsSaveConversations(conversations: BrainConversation[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(conversations)); } catch { /* quota exceeded */ }
}

export function lsLoadConversations(): BrainConversation[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as BrainConversation[]; } catch { return []; }
}

// ─── Write all 3 layers ───────────────────────────────────────────────────────

export async function saveConversationsAllLayers(
  conversations: BrainConversation[],
): Promise<{ api: boolean; idb: boolean }> {
  // Synchronous first — always succeeds or silently fails
  lsSaveConversations(conversations);
  // Async layers in parallel
  const [api, idb] = await Promise.all([
    apiSaveConversations(conversations),
    idbSaveConversations(conversations),
  ]);
  return { api, idb };
}

// ─── Read best available ──────────────────────────────────────────────────────

/**
 * Load from all 3 layers and return whichever has the most conversations.
 * Falls back gracefully if any layer is empty, corrupt, or unavailable.
 */
export async function loadBestConversations(): Promise<{
  conversations: BrainConversation[];
  source: 'api' | 'idb' | 'ls' | 'empty';
}> {
  const [api, idb] = await Promise.all([
    apiLoadConversations(),
    idbLoadConversations(),
  ]);
  const ls = lsLoadConversations();

  const best = [
    { data: api, source: 'api' as const },
    { data: idb, source: 'idb' as const },
    { data: ls,  source: 'ls'  as const },
  ].sort((a, b) => b.data.length - a.data.length)[0];

  if (best.data.length === 0) return { conversations: [], source: 'empty' };
  return { conversations: best.data, source: best.source };
}
