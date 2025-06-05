const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.onAdOnline = functions.firestore
  .document('ads/{adId}')
  .onCreate(async (snap, context) => {
    const ad = snap.data();
    const alertsSnap = await admin.firestore().collection('alerts').where('isActive', '==', true).get();
    const promises = [];
    alertsSnap.forEach(doc => {
      const alert = doc.data();
      if (ad.category === alert.category) {
        const msg = {
          notification: { title: 'Nouvelle annonce', body: ad.title },
          token: alert.fcmToken
        };
        promises.push(admin.messaging().send(msg));
      }
    });
    return Promise.all(promises);
  });
