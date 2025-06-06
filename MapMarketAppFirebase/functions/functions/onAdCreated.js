const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.incrementUserAds = functions.firestore
  .document('ads/{adId}')
  .onCreate(async (snap, context) => {
    const ad = snap.data();
    const userRef = admin.firestore().doc(`users/${ad.userId}`);
    await userRef.update({ adsPublished: admin.firestore.FieldValue.increment(1) });
  });
