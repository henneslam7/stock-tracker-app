import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  setDoc, 
  serverTimestamp, 
  collection, 
  getDocs, 
  deleteDoc, 
  updateDoc
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { PortfolioItem } from '../types';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Use the firestoreDatabaseId from the config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const googleProvider = new GoogleAuthProvider();

export function handleFirestoreError(error: any, operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write', path: string | null) {
  if (error instanceof Error && (error.message.includes('Missing or insufficient permissions') || error.message.includes('permission-denied') || (error as any).code === 'permission-denied')) {
    const currentUser = auth.currentUser;
    const errorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: currentUser ? {
        userId: currentUser.uid,
        email: currentUser.email || '',
        emailVerified: currentUser.emailVerified,
        isAnonymous: currentUser.isAnonymous,
        providerInfo: currentUser.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        }))
      } : null
    };
    throw new Error(JSON.stringify(errorInfo, null, 2));
  }
  throw error;
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user document exists
    const userRef = doc(db, 'users', user.uid);
    try {
      const docSnap = await getDocFromServer(userRef);
      if (!docSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          isSubscribed: false,
          createdAt: serverTimestamp()
        });
      }
    } catch(err) {
      handleFirestoreError(err, 'get', `/users/${user.uid}`);
    }
  } catch (error) {
    console.error("Login failed", error);
    throw error;
  }
}

export async function logout() {
  return signOut(auth);
}

// Database helper functions
export async function syncPortfolioToDb(userId: string, portfolio: PortfolioItem[]) {
  for (const item of portfolio) {
      const itemRef = doc(db, 'users', userId, 'portfolio', item.symbol);
      try {
        await setDoc(itemRef, {
          symbol: item.symbol,
          shares: item.shares,
          averagePrice: item.averagePrice,
          totalCost: item.totalCost,
          updatedAt: serverTimestamp()
        }, { merge: true }); // using merge to avoid strict create-only rules on existing fields 
      } catch (err: any) {
        handleFirestoreError(err, 'write', itemRef.path);
      }
  }
}

export async function loadPortfolioFromDb(userId: string): Promise<PortfolioItem[]> {
  try {
    const q = collection(db, 'users', userId, 'portfolio');
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        symbol: data.symbol,
        shares: data.shares,
        averagePrice: data.averagePrice,
        totalCost: data.totalCost
      };
    });
  } catch (err: any) {
    handleFirestoreError(err, 'list', `/users/${userId}/portfolio`);
    return [];
  }
}

export async function deletePortfolioItemDb(userId: string, symbol: string) {
    const itemRef = doc(db, 'users', userId, 'portfolio', symbol);
    try {
      await deleteDoc(itemRef);
    } catch (err: any) {
      handleFirestoreError(err, 'delete', itemRef.path);
    }
}

export async function toggleSubscriptionDb(userId: string, isSubscribed: boolean) {
    const userRef = doc(db, 'users', userId);
    try {
      await updateDoc(userRef, {
          isSubscribed,
          updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      handleFirestoreError(err, 'update', userRef.path);
    }
}

export async function checkSubscriptionDb(userId: string): Promise<boolean> {
   const userRef = doc(db, 'users', userId);
   try {
     const snap = await getDocFromServer(userRef);
     if (snap.exists()) {
        return snap.data().isSubscribed;
     }
   } catch(err) {
     handleFirestoreError(err, 'get', userRef.path);
   }
   return false;
}

export async function syncWatchlistToDb(userId: string, watchlist: string[]) {
  for (const symbol of watchlist) {
    const ref = doc(db, 'users', userId, 'watchlist', symbol);
    try {
      await setDoc(ref, { symbol, addedAt: serverTimestamp() });
    } catch {
      // Silently ignore — item likely already exists (no update rule needed)
    }
  }
}

export async function loadWatchlistFromDb(userId: string): Promise<string[]> {
  try {
    const q = collection(db, 'users', userId, 'watchlist');
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data().symbol as string);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `/users/${userId}/watchlist`);
    return [];
  }
}

export async function deleteWatchlistItemDb(userId: string, symbol: string) {
  const ref = doc(db, 'users', userId, 'watchlist', symbol);
  try {
    await deleteDoc(ref);
  } catch (err: any) {
    handleFirestoreError(err, 'delete', ref.path);
  }
}
