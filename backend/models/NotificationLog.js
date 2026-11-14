import mongoose from 'mongoose';
import crypto from 'crypto';

const notificationLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    userId: { type: String, default: null },
    channel: { type: String, required: true },
    eventType: { type: String, required: true },
    recipient: { type: String, default: null },
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    status: { type: String, default: '' },
    referenceId: { type: String, default: null },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false },
);

notificationLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('NotificationLog', notificationLogSchema);
