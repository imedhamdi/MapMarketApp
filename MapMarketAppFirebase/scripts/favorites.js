import { doc, updateDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { db, auth } from './auth.js';

export async function addFavorite(adId) {
  if (!auth.currentUser) return;
  const ref = doc(db, 'users', auth.currentUser.uid);
  await updateDoc(ref, { favorites: arrayUnion(adId) });
}

export async function removeFavorite(adId) {
  if (!auth.currentUser) return;
  const ref = doc(db, 'users', auth.currentUser.uid);
  await updateDoc(ref, { favorites: arrayRemove(adId) });
}
