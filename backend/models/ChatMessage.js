import mongoose from 'mongoose';
import crypto from 'crypto';

const chatMessageSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    roomId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
    timestamp: { type: Number, default: () => Date.now() },
  },
  { versionKey: false },
);

chatMessageSchema.index({ roomId: 1, timestamp: 1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
