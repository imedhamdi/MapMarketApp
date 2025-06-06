import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js';
import { showToast } from './utils.js';
import { app } from './auth.js';

const messaging = getMessaging(app);

export async function requestPermission() {
  try {
    const currentToken = await getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' });
    if (currentToken) {
      console.log('FCM token', currentToken);
    }
  } catch (err) {
    console.error('Unable to get token', err);
  }
}

export function initMessaging() {
  onMessage(messaging, payload => {
    showToast(payload.notification?.title || 'Notification');
  });
}
