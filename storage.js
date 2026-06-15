/* ============================================
   STORAGE MODULE
   IndexedDB + localStorage hybrid
   ============================================ */

const DB_NAME = 'pomosive_db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };
  });
}

// Generate UUID
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Get date string YYYY-MM-DD
function getDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// Session storage
const Storage = {
  async saveSession(session) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(session);
      request.onsuccess = () => resolve(session);
      request.onerror = () => reject(request.error);
    });
  },

  async getSessions(options = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.index('startedAt').openCursor(null, 'prev');
      const sessions = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(sessions); return; }
        sessions.push(cursor.value);
        if (options.limit && sessions.length >= options.limit) {
          resolve(sessions);
          return;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getSessionsByDateRange(startDate, endDate) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('startedAt');
      const range = IDBKeyRange.bound(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      const request = index.openCursor(range, 'prev');
      const sessions = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(sessions); return; }
        sessions.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getTodaySessions() {
    const today = getDateString();
    const all = await this.getSessions();
    return all.filter(s => s.date === today);
  },

  async getWeekSessions() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return this.getSessionsByDateRange(start.toISOString(), now.toISOString());
  },

  async getMonthSessions() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.getSessionsByDateRange(start.toISOString(), now.toISOString());
  },

  async deleteSession(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async exportAll() {
    const sessions = await this.getSessions();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: sessions
    };
  },

  async importAll(data) {
    if (!data.sessions || !Array.isArray(data.sessions)) {
      throw new Error('Invalid backup file');
    }
    await this.clearAll();
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let count = 0;
      for (const session of data.sessions) {
        store.put(session);
        count++;
      }
      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
    });
  }
};

// localStorage helpers
const LS = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch { return defaultValue; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

// Settings
const Settings = {
  get soundEnabled() { return LS.get('pomosive_sound', true); },
  set soundEnabled(v) { LS.set('pomosive_sound', v); },

  get darkMode() { return LS.get('pomosive_dark', true); },
  set darkMode(v) { LS.set('pomosive_dark', v); },

  get lastBlockDuration() { return LS.get('pomosive_last_block', 25); },
  set lastBlockDuration(v) { LS.set('pomosive_last_block', v); },

  get streak() { return LS.get('pomosive_streak', 0); },
  set streak(v) { LS.set('pomosive_streak', v); },

  get lastActiveDate() { return LS.get('pomosive_last_active', null); },
  set lastActiveDate(v) { LS.set('pomosive_last_active', v); },

  get consecutiveDistracted() { return LS.get('pomosive_consec_dist', 0); },
  set consecutiveDistracted(v) { LS.set('pomosive_consec_dist', v); },

  get dailyFlowTime() { return LS.get('pomosive_flow_time', 0); },
  set dailyFlowTime(v) { LS.set('pomosive_flow_time', v); },

  get dailyWorkTime() { return LS.get('pomosive_work_time', 0); },
  set dailyWorkTime(v) { LS.set('pomosive_work_time', v); },

  resetDaily() {
    LS.set('pomosive_flow_time', 0);
    LS.set('pomosive_work_time', 0);
    LS.set('pomosive_consec_dist', 0);
  },

  updateStreak() {
    const today = getDateString();
    const last = this.lastActiveDate;
    if (!last) {
      this.streak = 1;
    } else if (last === today) {
      // Same day, no change
    } else {
      const lastDate = new Date(last);
      const todayDate = new Date(today);
      const diff = (todayDate - lastDate) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        this.streak = this.streak + 1;
      } else if (diff > 1) {
        this.streak = 1;
      }
    }
    this.lastActiveDate = today;
  }
};
