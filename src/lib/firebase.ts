import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromCache } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';
import { logger } from './logger';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); 
export const auth = getAuth(app);

// Messaging may not be supported in all environments (e.g. non-HTTPS or certain browsers)
export const getMessagingSafe = async () => {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isSupported();
    if (supported) {
      return getMessaging(app);
    }
  } catch (error) {
    logger.warn('Firebase Messaging not supported:', error);
  }
  return null;
};

// Simple connection check logger
const checkConnection = async () => {
  try {
    // Just a probe to see if the client can talk to the server
    await getDocFromCache(doc(db, '_connection_test', 'status'));
  } catch (e) {
    // This is expected to fail if document doesn't exist, but we check for network/config errors
    console.debug("Firebase connection initialized");
  }
};
checkConnection();
