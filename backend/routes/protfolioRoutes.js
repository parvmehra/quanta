import express from "express";
import { protect } from "../middlewares/auth.js";
import { store, saveStore } from "../dataStore.js";
import { notifyUser } from "../services/notificationService.js";
import crypto from "crypto";

const router = express.Router();

router.get("/", protect, async (req, res) => {
  try {
    const items = store.portfolios.filter(p => p.user === req.user._id).sort((a, b) => b.createdAt - a.createdAt);
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", protect, async (req, res) => {
  const { symbol, shares, avgPrice, name, currentPrice } = req.body;
  try {
    const item = {
      _id: crypto.randomUUID(),
      user: req.user._id,
      symbol: (symbol || '').toUpperCase(),
      shares: Number(shares) || 1,
      avgPrice: Number(avgPrice) || 0,
      name: name || symbol,
      currentPrice: Number(currentPrice) || Number(avgPrice) || 0,
      createdAt: Date.now()
    };
    store.portfolios.push(item);
    saveStore();

    const fullUser = store.users.find(u => u._id === req.user._id);
    if (fullUser) {
      notifyUser(fullUser, 'STOCK_PURCHASE', {
        tradeDetails: {
          symbol: item.symbol,
          shares: item.shares,
          price: item.avgPrice,
          total: (item.shares * item.avgPrice).toFixed(2),
          type: 'BUY',
          referenceId: item._id,
        }
      });
    }

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", protect, async (req, res) => {
  const { shares, avgPrice, currentPrice, name } = req.body;
  try {
    const item = store.portfolios.find(p => p._id === req.params.id && p.user === req.user._id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (shares !== undefined) item.shares = shares;
    if (avgPrice !== undefined) item.avgPrice = avgPrice;
    if (currentPrice !== undefined) item.currentPrice = currentPrice;
    if (name !== undefined) item.name = name;

    saveStore();
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", protect, async (req, res) => {
  try {
    const itemIndex = store.portfolios.findIndex(p => p._id === req.params.id && p.user === req.user._id);
    if (itemIndex === -1) return res.status(404).json({ message: "Item not found" });
    
    store.portfolios.splice(itemIndex, 1);
    saveStore();
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/bulk", protect, async (req, res) => {
  const { holdings } = req.body;

  if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
    return res.status(400).json({ message: "Please provide an array of holdings" });
  }

  try {
    const items = holdings.map((h) => ({
      _id: crypto.randomUUID(),
      user: req.user._id,
      symbol: (h.symbol || "").toUpperCase(),
      shares: Number(h.shares) || 0,
      avgPrice: Number(h.avgPrice) || 0,
      name: h.name || "",
      currentPrice: Number(h.currentPrice) || 0,
      createdAt: Date.now()
    }));

    store.portfolios.push(...items);
    saveStore();
    res.status(201).json({ message: `Successfully imported ${items.length} holdings`, data: items });
  } catch (err) {
    console.error("Bulk import error:", err);
    res.status(500).json({ message: "Server error during bulk import" });
  }
});

export default router;
