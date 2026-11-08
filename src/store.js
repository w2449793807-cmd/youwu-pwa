import { normalizeState } from './core.js';

const DB_NAME = 'youwu-db';
const STORE_NAME = 'app';
const STATE_KEY = 'state';
const FALLBACK_KEY = 'youwu-state-v1';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function getPersistedState() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
  } catch {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

async function setPersistedState(state) {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  }
}

export class AppStore {
  constructor() {
    this.state = normalizeState();
    this.listeners = new Set();
    this.writeChain = Promise.resolve();
  }

  async init() {
    const persisted = await getPersistedState();
    this.state = normalizeState(persisted ?? this.state);
    this.emit({ source: 'init' });
    return this.state;
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event = {}) {
    for (const listener of this.listeners) listener(this.state, event);
  }

  persist() {
    const snapshot = clone(this.state);
    this.writeChain = this.writeChain.catch(() => {}).then(() => setPersistedState(snapshot));
    return this.writeChain;
  }

  async update(mutator, source = 'local') {
    const draft = clone(this.state);
    const result = await mutator(draft);
    this.state = normalizeState(result ?? draft);
    await this.persist();
    this.emit({ source });
    return this.state;
  }

  async replace(nextState, source = 'remote') {
    this.state = normalizeState(nextState);
    await this.persist();
    this.emit({ source });
    return this.state;
  }

  async reset() {
    this.state = normalizeState();
    await this.persist();
    this.emit({ source: 'local' });
    return this.state;
  }
}
