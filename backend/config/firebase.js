import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Fallback to serviceAccountKey.json if env vars are incomplete
if (!firebaseConfig.privateKey || !firebaseConfig.clientEmail) {
  const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      firebaseConfig = {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      };
    } catch (e) {
      console.warn('⚠️ Could not parse serviceAccountKey.json:', e.message);
    }
  }
}

let adminApp = null;
let adminAuth = null;

// Only initialize if credentials are available
if (firebaseConfig.projectId && firebaseConfig.clientEmail && firebaseConfig.privateKey) {
  try {
    adminApp = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert(firebaseConfig),
        });
    adminAuth = getAuth(adminApp);
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', err.message);
  }
} else {
  console.warn('⚠️ Firebase Admin credentials not configured — Google Auth token verification disabled');
}

export { adminApp, adminAuth };
export default {
  get apps() {
    return getApps();
  },
  auth: () => adminAuth,
};

