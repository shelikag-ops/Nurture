/**
 * Simple PIN-based Auth for Sarah Homeschool Dashboard
 * =====================================================
 *
 * Two roles:
 *   - "sarah"  → sees the student dashboard (tasks, submissions, journal)
 *   - "parent" → sees the parent panel (review submissions, edit plan, corrections)
 *
 * PINs are stored as SHA-256 hashes in Firebase (not plaintext).
 * Default PINs (change these in the settings):
 *   - Sarah:  1234
 *   - Parent: 9876
 *
 * USAGE:
 *   <script src="js/auth.js"></script>
 *
 *   // Show login screen if not authenticated
 *   Auth.requireLogin();
 *
 *   // Check current role
 *   if (Auth.isParent()) { showParentPanel(); }
 *   if (Auth.isSarah())  { showSarahView(); }
 *
 *   // Get current user
 *   const user = Auth.currentUser(); // { role: 'sarah', loggedInAt: ... }
 */

const Auth = (() => {

  // ── Default PIN hashes (SHA-256 of '1234' and '9876') ──
  // These are overwritten once the user sets custom PINs via Firebase
  const DEFAULT_HASHES = {
    sarah:  'a]PLACEHOLDER', // Will be computed on first load
    parent: 'b]PLACEHOLDER'
  };

  const SESSION_KEY = 'hs-auth-session';
  const PINS_FIREBASE_KEY = 'hs-auth-pins';

  // ── Crypto helper ──
  async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin.toString().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Session management ──
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Sessions expire after 12 hours
      if (Date.now() - session.loggedInAt > 12 * 60 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch(e) { return null; }
  }

  function setSession(role) {
    const session = { role, loggedInAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.__HS_USER_ROLE = role; // Used by DataSync
    return session;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    window.__HS_USER_ROLE = null;
  }

  // ── PIN storage (Firebase) ──
  async function getStoredHashes() {
    if (typeof DataSync !== 'undefined' && DataSync.isReady()) {
      const raw = await DataSync.getItem(PINS_FIREBASE_KEY, { shared: true });
      if (raw) return JSON.parse(raw);
    }
    // Fallback: generate default hashes
    return {
      sarah:  await hashPin('1234'),
      parent: await hashPin('9876')
    };
  }

  async function setPin(role, newPin) {
    const hashes = await getStoredHashes();
    hashes[role] = await hashPin(newPin);
    if (typeof DataSync !== 'undefined') {
      await DataSync.setItem(PINS_FIREBASE_KEY, JSON.stringify(hashes), { shared: true });
    }
    localStorage.setItem(PINS_FIREBASE_KEY, JSON.stringify(hashes));
  }

  // ── Login ──
  async function login(pin) {
    const hashes = await getStoredHashes();
    const inputHash = await hashPin(pin);

    if (inputHash === hashes.sarah) {
      return setSession('sarah');
    } else if (inputHash === hashes.parent) {
      return setSession('parent');
    } else {
      return null; // Invalid PIN
    }
  }

  function logout() {
    clearSession();
    location.reload();
  }

  // ── Role checks ──
  function currentUser() {
    const session = getSession();
    if (session) window.__HS_USER_ROLE = session.role;
    return session;
  }

  function isLoggedIn() { return getSession() !== null; }
  function isSarah()    { const s = getSession(); return s && s.role === 'sarah'; }
  function isParent()   { const s = getSession(); return s && s.role === 'parent'; }

  // ── Login UI ──

  /**
   * Show a full-screen login overlay if not authenticated.
   * Resolves when the user successfully logs in.
   */
  function requireLogin() {
    return new Promise((resolve) => {
      const session = getSession();
      if (session) {
        window.__HS_USER_ROLE = session.role;
        resolve(session);
        return;
      }

      // Create login overlay
      const overlay = document.createElement('div');
      overlay.id = 'hs-login-overlay';
      overlay.innerHTML = `
        <style>
          #hs-login-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            display: flex; align-items: center; justify-content: center;
            font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif;
          }
          .hs-login-card {
            background: rgba(255,255,255,0.07);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 48px 40px;
            text-align: center;
            max-width: 380px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          .hs-login-card h1 {
            color: #fff;
            font-size: 28px;
            margin: 0 0 8px;
            font-weight: 700;
          }
          .hs-login-card p {
            color: rgba(255,255,255,0.6);
            margin: 0 0 32px;
            font-size: 15px;
          }
          .hs-pin-input {
            display: flex; gap: 12px; justify-content: center; margin-bottom: 24px;
          }
          .hs-pin-input input {
            width: 56px; height: 64px;
            background: rgba(255,255,255,0.08);
            border: 2px solid rgba(255,255,255,0.15);
            border-radius: 14px;
            color: #fff;
            font-size: 28px;
            text-align: center;
            font-weight: 700;
            outline: none;
            transition: border-color 0.2s, background 0.2s;
            -webkit-text-security: disc;
          }
          .hs-pin-input input:focus {
            border-color: #6c63ff;
            background: rgba(108,99,255,0.12);
          }
          .hs-login-error {
            color: #ff6b6b;
            font-size: 14px;
            min-height: 20px;
            margin-bottom: 8px;
            transition: opacity 0.2s;
          }
          .hs-login-emoji {
            font-size: 48px;
            margin-bottom: 16px;
          }
          .hs-login-hint {
            color: rgba(255,255,255,0.35);
            font-size: 12px;
            margin-top: 24px;
          }
        </style>
        <div class="hs-login-card">
          <div class="hs-login-emoji">📚</div>
          <h1>Sarah's Dashboard</h1>
          <p>Enter your PIN to continue</p>
          <div class="hs-pin-input">
            <input type="tel" maxlength="1" data-idx="0" inputmode="numeric" autofocus>
            <input type="tel" maxlength="1" data-idx="1" inputmode="numeric">
            <input type="tel" maxlength="1" data-idx="2" inputmode="numeric">
            <input type="tel" maxlength="1" data-idx="3" inputmode="numeric">
          </div>
          <div class="hs-login-error" id="hs-login-error"></div>
          <div class="hs-login-hint">Sarah's PIN → Student view &nbsp;|&nbsp; Parent PIN → Review panel</div>
        </div>
      `;

      document.body.appendChild(overlay);

      // PIN input logic
      const inputs = overlay.querySelectorAll('.hs-pin-input input');
      const errorEl = overlay.querySelector('#hs-login-error');

      inputs.forEach((inp, i) => {
        inp.addEventListener('input', async () => {
          if (inp.value.length === 1 && i < 3) {
            inputs[i + 1].focus();
          }
          // Check if all 4 digits entered
          const pin = Array.from(inputs).map(el => el.value).join('');
          if (pin.length === 4) {
            const session = await login(pin);
            if (session) {
              overlay.remove();
              resolve(session);
            } else {
              errorEl.textContent = 'Incorrect PIN — try again';
              inputs.forEach(el => { el.value = ''; });
              inputs[0].focus();
              setTimeout(() => { errorEl.textContent = ''; }, 2000);
            }
          }
        });

        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !inp.value && i > 0) {
            inputs[i - 1].focus();
          }
        });

        // Handle paste
        inp.addEventListener('paste', (e) => {
          e.preventDefault();
          const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
          pasted.split('').forEach((ch, j) => {
            if (inputs[j]) inputs[j].value = ch;
          });
          if (pasted.length === 4) inputs[3].dispatchEvent(new Event('input'));
          else if (pasted.length > 0) inputs[Math.min(pasted.length, 3)].focus();
        });
      });

      // Auto-focus first input
      setTimeout(() => inputs[0].focus(), 100);
    });
  }

  // ── Settings: Change PIN ──
  async function changePinUI() {
    const role = prompt('Change PIN for which role? (sarah / parent)');
    if (role !== 'sarah' && role !== 'parent') return;
    const newPin = prompt(`Enter new 4-digit PIN for ${role}:`);
    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      alert('PIN must be exactly 4 digits.');
      return;
    }
    const confirm = prompt('Confirm the PIN:');
    if (confirm !== newPin) {
      alert('PINs did not match.');
      return;
    }
    await setPin(role, newPin);
    alert(`✅ ${role} PIN updated!`);
  }

  // ── Public API ──
  return {
    login,
    logout,
    requireLogin,
    currentUser,
    isLoggedIn,
    isSarah,
    isParent,
    setPin,
    changePinUI
  };

})();
