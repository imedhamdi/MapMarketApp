import { collection, addDoc, getDocs, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { db, auth } from './auth.js';

export async function createAlert(data) {
  if (!auth.currentUser) return;
  data.userId = auth.currentUser.uid;
  await addDoc(collection(db, 'alerts'), data);
}

export async function getUserAlerts() {
  if (!auth.currentUser) return [];
  const q = collection(db, 'alerts');
  const snap = await getDocs(q);
  return snap.docs.filter(d => d.data().userId === auth.currentUser.uid).map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteAlert(id) {
  await deleteDoc(doc(db, 'alerts', id));
}
