const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.saveToken = functions.https.onCall(async (data, context) => {
  const uid = context.auth.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Not signed in');
  await admin.firestore().doc(`users/${uid}`).update({ fcmToken: data.token });
  return { success: true };
});
