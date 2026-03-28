/**
 * Firebase Configuration & Initialization
 * =========================================
 * This file initializes Firebase for the Sarah Homeschool Dashboard.
 *
 * SETUP: Replace the placeholder config below with your actual Firebase config
 * from the Firebase Console (see setup-guide.html for instructions).
 *
 * Uses Firebase v9 compat mode so it works as a simple <script> include
 * in any HTML file — no build step needed.
 */

// ── Firebase SDK (loaded via CDN in HTML files) ──
// These scripts must be included BEFORE this file:
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>

// ══════════════════════════════════════════════════════════════
// 🔧  REPLACE THIS BLOCK with your Firebase project config
// ══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC9iJMtAjbs8Wc96rB6Rgqx7H5DxrOaTCU",
  authDomain:        "gbhomeschool-d68a8.firebaseapp.com",
  databaseURL:       "https://gbhomeschool-d68a8-default-rtdb.firebaseio.com",
  projectId:         "gbhomeschool-d68a8",
  storageBucket:     "gbhomeschool-d68a8.firebasestorage.app",
  messagingSenderId: "414165726712",
  appId:             "1:414165726712:web:1f000b48a7af57f225920d"
};
// ══════════════════════════════════════════════════════════════

// Initialize Firebase (only once)
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

// Export the Realtime Database reference
const db = firebase.database();

/**
 * Check if Firebase is properly configured (not using placeholder values)
 */
function isFirebaseConfigured() {
  return FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY"
      && FIREBASE_CONFIG.databaseURL.indexOf("YOUR_PROJECT") === -1;
}

console.log("[Firebase]", isFirebaseConfigured()
  ? "✅ Connected to " + FIREBASE_CONFIG.projectId
  : "⚠️ Using placeholder config — data will only persist locally. See setup-guide.html");
