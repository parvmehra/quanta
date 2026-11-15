import express from 'express';
import Watchlist from '../models/Watchlist.js';
import { protect } from '../middlewares/auth.js';
import { cleanSymbol } from '../controllers/stockDataController.js';

const router = express.Router();
router.use(protect);

export const MAX_LISTS = 10;
export const MAX_SYMBOLS = 100;
const DEFAULT_NAME = 'Watchlist';

const symbolOf = (raw) => {
  const s = cleanSymbol(raw);
  return s && !s.startsWith('^') && !s.includes('=') ? s : null;
};
const cleanName = (raw) => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '');
const present = (w) => ({ id: w._id, name: w.name, isDefault: w.isDefault, symbols: w.symbols, updatedAt: w.updatedAt });
const isDuplicate = (err) => err && (err.code === 11000 || err.code === 11001);

async function ensureDefault(userId) {
  if (await Watchlist.exists({ userId })) return;
  try {
    await Watchlist.create({ userId, name: DEFAULT_NAME, nameKey: DEFAULT_NAME.toLowerCase(), isDefault: true });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
  }
}

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error('Watchlist route error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

router.get('/', handle(async (req, res) => {
  await ensureDefault(req.user._id);
  const lists = await Watchlist.find({ userId: req.user._id }).sort({ createdAt: 1 }).lean();
  res.json({ lists: lists.map(present), limits: { maxLists: MAX_LISTS, maxSymbols: MAX_SYMBOLS } });
}));

router.post('/', handle(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name || name.length > 40) return res.status(400).json({ message: 'Give the list a name of up to 40 characters.' });
  await ensureDefault(req.user._id);
  if ((await Watchlist.countDocuments({ userId: req.user._id })) >= MAX_LISTS) {
    return res.status(400).json({ message: `You can have at most ${MAX_LISTS} lists.` });
  }
  try {
    const list = await Watchlist.create({ userId: req.user._id, name, nameKey: name.toLowerCase() });
    res.status(201).json({ list: present(list) });
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'You already have a list with that name.' });
    throw err;
  }
}));

router.patch('/:id', handle(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name || name.length > 40) return res.status(400).json({ message: 'Give the list a name of up to 40 characters.' });
  try {
    const list = await Watchlist.findOneAndUpdate({ _id: String(req.params.id), userId: req.user._id }, { $set: { name, nameKey: name.toLowerCase() } }, { new: true });
    if (!list) return res.status(404).json({ message: 'List not found.' });
    res.json({ list: present(list) });
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'You already have a list with that name.' });
    throw err;
  }
}));

router.delete('/:id', handle(async (req, res) => {
  const list = await Watchlist.findOne({ _id: String(req.params.id), userId: req.user._id });
  if (!list) return res.status(404).json({ message: 'List not found.' });
  if (list.isDefault) return res.status(400).json({ message: 'The default list cannot be deleted. You can rename it or empty it.' });
  await list.deleteOne();
  res.json({ removed: true });
}));

router.post('/:id/symbols', handle(async (req, res) => {
  const symbol = symbolOf(req.body?.symbol);
  if (!symbol) return res.status(400).json({ message: 'A valid stock symbol is required.' });
  const filter = { _id: String(req.params.id), userId: req.user._id };
  const updated = await Watchlist.findOneAndUpdate(
    { ...filter, symbols: { $ne: symbol }, [`symbols.${MAX_SYMBOLS - 1}`]: { $exists: false } },
    { $addToSet: { symbols: symbol } },
    { new: true },
  );
  if (updated) return res.status(201).json({ list: present(updated) });
  const list = await Watchlist.findOne(filter);
  if (!list) return res.status(404).json({ message: 'List not found.' });
  if (list.symbols.includes(symbol)) return res.json({ list: present(list), duplicate: true });
  return res.status(400).json({ message: `A list can hold at most ${MAX_SYMBOLS} stocks.` });
}));

router.delete('/:id/symbols/:symbol', handle(async (req, res) => {
  const symbol = symbolOf(req.params.symbol);
  if (!symbol) return res.status(400).json({ message: 'A valid stock symbol is required.' });
  const list = await Watchlist.findOneAndUpdate({ _id: String(req.params.id), userId: req.user._id }, { $pull: { symbols: symbol } }, { new: true });
  if (!list) return res.status(404).json({ message: 'List not found.' });
  res.json({ list: present(list) });
}));

router.post('/import', handle(async (req, res) => {
  const incoming = [...new Set((Array.isArray(req.body?.symbols) ? req.body.symbols : []).map(symbolOf).filter(Boolean))].slice(0, MAX_SYMBOLS);
  await ensureDefault(req.user._id);
  const list = await Watchlist.findOne({ userId: req.user._id, isDefault: true });
  const before = new Set(list.symbols);
  const merged = [...new Set([...list.symbols, ...incoming])].slice(0, MAX_SYMBOLS);
  list.symbols = merged;
  await list.save();
  res.json({ list: present(list), added: merged.filter((s) => !before.has(s)).length });
}));

export default router;
