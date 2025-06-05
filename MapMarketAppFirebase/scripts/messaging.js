import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { db, auth } from './auth.js';

export function listenMessages(threadId, cb) {
  const q = query(collection(db, 'threads', threadId, 'messages'), orderBy('createdAt'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function sendMessage(threadId, text) {
  if (!auth.currentUser) return;
  await addDoc(collection(db, 'threads', threadId, 'messages'), {
    text,
    senderId: auth.currentUser.uid,
    createdAt: serverTimestamp()
  });
}
