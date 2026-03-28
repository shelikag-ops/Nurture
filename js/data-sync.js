/**
 * DataSync — Drop-in localStorage replacement with Firebase cloud sync
 * =====================================================================
 *
 * This module provides the SAME API as localStorage but automatically
 * syncs data to Firebase Realtime Database, so Sarah's iPad and Shell's
 * laptop always see the same data.
 *
 * USAGE (in any HTML file):
 *   <!-- Include Firebase SDK + config first -->
 *   <script src="js/firebase-config.js"></script>
 *   <script src="js/data-sync.js"></script>
 *
 *   // Then use exactly like localStorage:
 *   await DataSync.setItem('hs-cfg-override', JSON.stringify(config));
 *   const config = JSON.parse(await DataSync.getItem('hs-cfg-override'));
 *
 *   // Or listen for real-time changes from other devices:
 *   DataSync.onUpdate('hs-submissions', (newValue) => {
 *     console.log('Submissions changed on another device!', newValue);
 *   });
 *
 * FALLBACK: If Firebase is not configured, everything falls back to
 * plain localStorage so the app still works offline / during setup.
 */

const DataSync = (() => {

  // ── Helpers ──

  /** Sanitize localStorage keys for use as Firebase paths */
  function keyToPath(key) {
    // Firebase paths can't contain . $ # [ ] /
    return key.replace(/[.$#\[\]\/]/g, '_');
  }

  /** Get the current user role from auth (defaults to 'shared') */
  function getUserScope() {
    // Some data is per-user (e.g., Sarah's journal vs Shell's parent notes)
    // Some data is shared (e.g., submissions, weekly plan)
    // The auth module sets this
    return window.__HS_USER_ROLE || 'shared';
  }

  /** Firebase ref for a given key */
  function getRef(key, options = {}) {
    const path = keyToPath(key);
    const scope = options.shared ? 'shared' : getUserScope();
    return db.ref(`homeschool/${scope}/${path}`);
  }

  // ── Core API (async versions of localStorage) ──

  /**
   * Store a value — saves to both localStorage (instant) and Firebase (async).
   * @param {string} key
   * @param {string} value — must be a string (same as localStorage)
   * @param {object} options — { shared: true } to force shared scope
   */
  async function setItem(key, value, options = {}) {
    // Always write to localStorage first (instant, works offline)
    try { localStorage.setItem(key, value); } catch(e) { /* quota */ }

    // Then sync to Firebase
    if (isFirebaseConfigured()) {
      try {
        await getRef(key, options).set({
          value: value,
          updatedAt: firebase.database.ServerValue.TIMESTAMP,
          updatedBy: getUserScope()
        });
      } catch (err) {
        console.warn('[DataSync] Firebase write failed for', key, err.message);
      }
    }
  }

  /**
   * Retrieve a value — tries Firebase first (latest), falls back to localStorage.
   * @param {string} key
   * @param {object} options — { shared: true } to force shared scope
   * @returns {string|null}
   */
  async function getItem(key, options = {}) {
    if (isFirebaseConfigured()) {
      try {
        const snap = await getRef(key, options).once('value');
        if (snap.exists()) {
          const data = snap.val();
          const val = typeof data === 'object' && data.value !== undefined ? data.value : data;
          // Update localStorage cache
          try { localStorage.setItem(key, val); } catch(e) {}
          return val;
        }
      } catch (err) {
        console.warn('[DataSync] Firebase read failed for', key, err.message);
      }
    }
    // Fallback to localStorage
    return localStorage.getItem(key);
  }

  /**
   * Remove a value from both localStorage and Firebase.
   */
  async function removeItem(key, options = {}) {
    localStorage.removeItem(key);
    if (isFirebaseConfigured()) {
      try { await getRef(key, options).remove(); } catch(e) {}
    }
  }

  /**
   * Listen for real-time updates from Firebase (other devices).
   * Callback fires whenever the value changes on ANY device.
   * @param {string} key
   * @param {function} callback — receives the new value (string)
   * @param {object} options
   * @returns {function} unsubscribe function
   */
  function onUpdate(key, callback, options = {}) {
    if (!isFirebaseConfigured()) return () => {};

    const ref = getRef(key, options);
    const handler = ref.on('value', (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const val = typeof data === 'object' && data.value !== undefined ? data.value : data;
        // Update local cache
        try { localStorage.setItem(key, val); } catch(e) {}
        callback(val);
      }
    });

    // Return unsubscribe function
    return () => ref.off('value', handler);
  }

  // ── Bulk Operations ──

  /**
   * Migrate all existing localStorage data to Firebase (one-time).
   * Call this once after Firebase is first configured.
   */
  async function migrateLocalStorageToFirebase() {
    if (!isFirebaseConfigured()) {
      console.warn('[DataSync] Cannot migrate — Firebase not configured');
      return { migrated: 0 };
    }

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('hs-')) keys.push(key);
    }

    let migrated = 0;
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        // Determine if shared or per-user based on key naming
        const isShared = key.startsWith('hs-submissions')
                      || key.startsWith('hs-cfg')
                      || key.startsWith('hs-sub-notifs');
        await setItem(key, value, { shared: isShared });
        migrated++;
      }
    }

    console.log(`[DataSync] Migrated ${migrated} keys to Firebase`);
    return { migrated, keys };
  }

  /**
   * Download all Firebase data to localStorage (for offline use).
   */
  async function syncFromFirebase() {
    if (!isFirebaseConfigured()) return;

    try {
      const snap = await db.ref('homeschool').once('value');
      if (!snap.exists()) return;

      const data = snap.val();
      let synced = 0;

      // Walk through all scopes and keys
      for (const [scope, entries] of Object.entries(data)) {
        if (typeof entries !== 'object') continue;
        for (const [path, record] of Object.entries(entries)) {
          if (record && record.value !== undefined) {
            // Reverse the path sanitization for localStorage key
            // (best-effort — the original key is the canonical form)
            try { localStorage.setItem(path, record.value); } catch(e) {}
            synced++;
          }
        }
      }
      console.log(`[DataSync] Synced ${synced} keys from Firebase to localStorage`);
    } catch (err) {
      console.warn('[DataSync] Sync from Firebase failed:', err.message);
    }
  }

  // ── Submissions-specific helpers ──

  /**
   * Add a new submission (from Sarah's view).
   * Automatically syncs to Firebase so parent sees it instantly.
   */
  async function addSubmission(submission) {
    const raw = await getItem('hs-submissions', { shared: true });
    const submissions = raw ? JSON.parse(raw) : [];
    submissions.push(submission);
    await setItem('hs-submissions', JSON.stringify(submissions), { shared: true });
    return submissions;
  }

  /**
   * Update a submission (e.g., parent marks it reviewed).
   */
  async function updateSubmission(submissionId, updates) {
    const raw = await getItem('hs-submissions', { shared: true });
    const submissions = raw ? JSON.parse(raw) : [];
    const idx = submissions.findIndex(s => s.id === submissionId);
    if (idx !== -1) {
      Object.assign(submissions[idx], updates);
      await setItem('hs-submissions', JSON.stringify(submissions), { shared: true });
    }
    return submissions;
  }

  /**
   * Get all submissions.
   */
  async function getSubmissions() {
    const raw = await getItem('hs-submissions', { shared: true });
    return raw ? JSON.parse(raw) : [];
  }

  // ── Task completion helpers ──

  /**
   * Mark a task complete for today.
   */
  async function setTaskDone(dateISO, taskId, done = true) {
    const key = `hs-day-${dateISO}`;
    const raw = await getItem(key, { shared: true });
    const dayData = raw ? JSON.parse(raw) : {};
    dayData[taskId] = done;
    await setItem(key, JSON.stringify(dayData), { shared: true });
    return dayData;
  }

  /**
   * Get task completion status for a date.
   */
  async function getTaskStatus(dateISO) {
    const key = `hs-day-${dateISO}`;
    const raw = await getItem(key, { shared: true });
    return raw ? JSON.parse(raw) : {};
  }

  // ── Journal helpers ──

  async function saveJournal(dateISO, entry) {
    const key = `hs-journal-${dateISO}`;
    await setItem(key, JSON.stringify(entry));
  }

  async function getJournal(dateISO) {
    const key = `hs-journal-${dateISO}`;
    const raw = await getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  // ── Corrections Dashboard helpers ──

  /**
   * Save corrections data (scores, errors, chapter results).
   * This is what bridges submissions → corrections dashboard.
   */
  async function saveCorrections(subject, chapterId, data) {
    const key = `hs-corrections-${subject}-${chapterId}`;
    await setItem(key, JSON.stringify({
      ...data,
      lastUpdated: new Date().toISOString()
    }), { shared: true });
  }

  async function getCorrections(subject, chapterId) {
    const key = `hs-corrections-${subject}-${chapterId}`;
    const raw = await getItem(key, { shared: true });
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Get all corrections for a subject (for dashboard summary).
   */
  async function getAllCorrections(subject) {
    if (!isFirebaseConfigured()) {
      // Fallback: scan localStorage
      const results = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`hs-corrections-${subject}-`)) {
          const chapterId = key.replace(`hs-corrections-${subject}-`, '');
          results[chapterId] = JSON.parse(localStorage.getItem(key));
        }
      }
      return results;
    }

    try {
      const snap = await db.ref(`homeschool/shared`).once('value');
      if (!snap.exists()) return {};
      const all = snap.val();
      const results = {};
      const prefix = `hs-corrections-${subject}-`;
      for (const [path, record] of Object.entries(all)) {
        if (path.startsWith(keyToPath(prefix))) {
          const chapterId = path.replace(keyToPath(prefix), '');
          results[chapterId] = JSON.parse(record.value);
        }
      }
      return results;
    } catch (err) {
      console.warn('[DataSync] Error fetching corrections:', err);
      return {};
    }
  }

  // ── Weekly plan helpers ──

  /**
   * Save weekly plan configuration.
   */
  async function savePlan(weekConfig) {
    await setItem('hs-cfg-override', JSON.stringify(weekConfig), { shared: true });
  }

  async function getPlan() {
    const raw = await getItem('hs-cfg-override', { shared: true });
    return raw ? JSON.parse(raw) : null;
  }

  // ── Public API ──

  return {
    // Core (localStorage-compatible)
    setItem,
    getItem,
    removeItem,
    onUpdate,

    // Migration
    migrateLocalStorageToFirebase,
    syncFromFirebase,

    // Domain-specific
    addSubmission,
    updateSubmission,
    getSubmissions,
    setTaskDone,
    getTaskStatus,
    saveJournal,
    getJournal,
    saveCorrections,
    getCorrections,
    getAllCorrections,
    savePlan,
    getPlan,

    // Utility
    isReady: () => isFirebaseConfigured()
  };

})();
