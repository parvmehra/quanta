import express from 'express';
import ChatMessage from '../models/ChatMessage.js';
import { protect, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.get('/admin/rooms', protect, requireAdmin, async (_req, res) => {
  try {
    const messages = await ChatMessage.find().sort({ timestamp: 1 }).limit(5000).lean();
    const rooms = new Map();
    for (const m of messages) {
      const room = rooms.get(m.roomId) || { roomId: m.roomId, lastMessage: m.text, timestamp: m.timestamp, userName: m.senderName };
      if (m.timestamp >= room.timestamp) { room.lastMessage = m.text; room.timestamp = m.timestamp; }
      if (m.senderName && m.senderName !== 'Admin') room.userName = m.senderName;
      rooms.set(m.roomId, room);
    }
    res.json([...rooms.values()].sort((a, b) => b.timestamp - a.timestamp));
  } catch {
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

router.get('/:roomId', protect, async (req, res) => {
  const roomId = String(req.params.roomId);
  if (req.user.role !== 'admin' && roomId !== req.user._id) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const messages = await ChatMessage.find({ roomId }).sort({ timestamp: 1 }).limit(500).lean();
    res.json(messages);
  } catch {
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

export default router;
