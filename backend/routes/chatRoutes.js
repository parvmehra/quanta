import express from 'express';
import { store } from '../dataStore.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.get('/:roomId', protect, (req, res) => {
  try {
    const messages = (store.messages || []).filter(m => m.roomId === req.params.roomId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages" });
  }
});

router.get('/admin/rooms', protect, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized" });
    }
    
    const messages = store.messages || [];
    const roomsMap = new Map();
    
    messages.forEach(msg => {
      if (!roomsMap.has(msg.roomId)) {
        roomsMap.set(msg.roomId, {
          roomId: msg.roomId,
          lastMessage: msg.text,
          timestamp: msg.timestamp,
          userName: msg.senderName
        });
      } else {
        const room = roomsMap.get(msg.roomId);
        if (msg.timestamp > room.timestamp) {
          room.lastMessage = msg.text;
          room.timestamp = msg.timestamp;
        }
        if (msg.senderName && msg.senderName !== 'Admin') {
            room.userName = msg.senderName;
        }
      }
    });
    
    const rooms = Array.from(roomsMap.values()).sort((a, b) => b.timestamp - a.timestamp);
    res.json(rooms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching rooms" });
  }
});

export default router;
