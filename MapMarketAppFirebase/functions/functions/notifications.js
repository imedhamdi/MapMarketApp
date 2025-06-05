const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.onMessageCreated = functions.firestore
  .document('threads/{threadId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const recipientId = data.recipientId;
    if (!recipientId) return null;
    const tokenSnap = await admin.firestore().doc(`users/${recipientId}`).get();
    const token = tokenSnap.data().fcmToken;
    if (!token) return null;
    return admin.messaging().send({
      token,
      notification: {
        title: 'Nouveau message',
        body: data.text || 'Vous avez reçu un message'
      }
    });
  });
