import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const primaryDataFile = path.join(dataDir, 'data.json');
const legacyDataFile = path.join(__dirname, 'data.json');

const loadData = () => {
  const targetFile = fs.existsSync(primaryDataFile) ? primaryDataFile : legacyDataFile;
  if (!fs.existsSync(targetFile)) {
    return { users: [], portfolios: [], messages: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
  } catch (err) {
    console.error('Failed to parse data store, falling back to empty store:', err);
    return { users: [], portfolios: [], messages: [] };
  }
};

const saveData = (data) => {
  try {
    fs.writeFileSync(primaryDataFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving data store:', err);
  }
};

export const store = loadData();

let saveTimeout = null;
export const saveStore = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveData(store);
  }, 100);
};

export const saveStoreImmediate = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveData(store);
};
