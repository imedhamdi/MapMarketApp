import { enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { db } from './auth.js';
import { initAuth } from './auth.js';
import { initMap } from './map.js';
import { initMessaging } from './notifications.js';

initAuth();
initMap();
initMessaging();

enableIndexedDbPersistence(db).catch(console.error);
