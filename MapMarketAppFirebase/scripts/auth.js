import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, doc, setDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { showToast, $ } from './utils.js';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function initAuth() {
  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');
  const resetForm = $('#reset-password-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = loginForm['login-email'].value;
      const password = loginForm['login-password'].value;
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = signupForm['signup-email'].value;
      const password = signupForm['signup-password'].value;
      const name = signupForm['signup-name'].value;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), { name, email, createdAt: Date.now() });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = resetForm['reset-email'].value;
      try {
        await sendPasswordResetEmail(auth, email);
        showToast('Email envoyé');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  document.querySelectorAll('[data-firebase-auth-action="logout"]').forEach(btn => {
    btn.addEventListener('click', () => signOut(auth));
  });

  onAuthStateChanged(auth, user => {
    document.body.dataset.loggedIn = !!user;
  });
}
