// public/js/auth.js
import { auth } from "./firebase-init.js";
import {
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

export async function ensureAnon() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function loginEmailPassword(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// Global Auth UI logic
export function initGlobalAuthUI(requireAuthForAccess = false) {
  if (document.getElementById('globalAuthModal')) return;

  const modalHtml = `
  <div id="globalAuthModal" class="hidden" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
    <div class="card" style="width:90%; max-width:400px; padding:24px;">
      <h3 style="margin-top:0;">התחברות מנהל 🔒</h3>
      <div class="small" style="margin-bottom:15px;">גישה מתקדמת (דשבורד, רשומות, וינשוף) דורשת הזדהות.</div>
      
      <label>אימייל</label>
      <input id="globalAuthEmail" type="email" placeholder="name@example.com" style="width:100%; margin-bottom:10px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; padding:10px; border-radius:8px;" />
      
      <label>סיסמה</label>
      <input id="globalAuthPass" type="password" placeholder="••••••••" style="width:100%; margin-bottom:15px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; padding:10px; border-radius:8px;" />
      
      <div class="actions">
        <button class="primary" id="globalDoLoginBtn" style="flex:1;">התחברות</button>
        <button id="globalCancelLoginBtn" style="flex:1;">ביטול</button>
      </div>
      <div class="small" id="globalLoginErr" style="color:#ff6b6b; margin-top:10px; text-align:center;"></div>
    </div>
  </div>`;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = document.getElementById('globalAuthModal');
  const emailIn = document.getElementById('globalAuthEmail');
  const passIn = document.getElementById('globalAuthPass');
  const doLoginBtn = document.getElementById('globalDoLoginBtn');
  const cancelBtn = document.getElementById('globalCancelLoginBtn');
  const errDiv = document.getElementById('globalLoginErr');

  // Cancel logic (redirect if auth is strictly required for this page)
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    if (requireAuthForAccess && !auth.currentUser) {
      window.location.href = 'index.html';
    }
  });

  doLoginBtn.addEventListener('click', async () => {
    errDiv.textContent = 'מתחבר...';
    try {
      await loginEmailPassword(emailIn.value.trim(), passIn.value);
      errDiv.textContent = '';
      modal.classList.add('hidden');
    } catch(e) {
      errDiv.textContent = 'שגיאת התחברות. ודא פרטים מורשים.';
    }
  });

  // Export functions to trigger it
  window.showLoginModal = () => {
    emailIn.value = '';
    passIn.value = '';
    errDiv.textContent = '';
    modal.classList.remove('hidden');
  };

  // Bind to generic header login/logout buttons
  const headerLoginBtn = document.getElementById('loginBtn');
  const headerLogoutBtn = document.getElementById('logoutBtn');
  
  if (headerLoginBtn) {
    headerLoginBtn.addEventListener('click', () => {
      window.showLoginModal();
    });
  }
  
  if (headerLogoutBtn) {
    headerLogoutBtn.addEventListener('click', async () => {
      await logout();
      if (requireAuthForAccess) {
        window.location.href = 'index.html';
      }
    });
  }

  // Manage UI state based on auth changes
  watchAuth(u => {
    // We treat Anonymous users as "Not Logged In" for the UI purpose
    const isRealUser = u && !u.isAnonymous;
    
    if (headerLoginBtn) headerLoginBtn.classList.toggle('hidden', isRealUser);
    if (headerLogoutBtn) headerLogoutBtn.classList.toggle('hidden', !isRealUser);
    
    // Check all possible admin tabs across pages
    const adminTabs = document.querySelectorAll('#adminTabBtn');
    adminTabs.forEach(tab => tab.classList.toggle('hidden', !isRealUser));
    
    if (isRealUser) {
      modal.classList.add('hidden');
    } else if (requireAuthForAccess) {
      window.showLoginModal();
    }
  });
}
