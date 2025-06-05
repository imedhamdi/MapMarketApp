import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { db, auth } from './auth.js';
import { showToast } from './utils.js';

export async function createAd(data) {
  try {
    if (!auth.currentUser) throw new Error('Not authenticated');
    data.userId = auth.currentUser.uid;
    data.createdAt = serverTimestamp();
    await addDoc(collection(db, 'ads'), data);
    showToast('Annonce créée', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

export async function getAds() {
  const snap = await getDocs(collection(db, 'ads'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
