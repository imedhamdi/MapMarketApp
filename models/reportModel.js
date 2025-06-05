// models/reportModel.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.ObjectId, ref: 'Message', required: true },
    threadId: { type: mongoose.Schema.ObjectId, ref: 'Thread' },
    reportedBy: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true },
    content: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
