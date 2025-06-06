const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.updateStats = functions.firestore
  .document('reviews/{reviewId}')
  .onCreate(async (snap, context) => {
    const review = snap.data();
    const targetRef = admin.firestore().doc(`ads/${review.targetId}`);
    const statsField = 'avgRating';
    const adDoc = await targetRef.get();
    const current = adDoc.data()[statsField] || 0;
    await targetRef.update({ [statsField]: (current + review.rating) / 2 });
  });
