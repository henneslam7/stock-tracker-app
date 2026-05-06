import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isSubscribed: boolean;
  isAdmin: boolean;
}

async function fetchUserData(firebaseUser: User): Promise<AuthUser> {
  try {
    const snap = await getDocFromServer(doc(db, 'users', firebaseUser.uid));
    const data = snap.exists() ? snap.data() : {};
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      photoURL: firebaseUser.photoURL || '',
      isSubscribed: data.isSubscribed ?? false,
      isAdmin: data.isAdmin ?? false,
    };
  } catch {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || '',
      photoURL: firebaseUser.photoURL || '',
      isSubscribed: false,
      isAdmin: false,
    };
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
      } else {
        setUser(await fetchUserData(firebaseUser));
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshUser = async () => {
    if (!auth.currentUser) return;
    setUser(await fetchUserData(auth.currentUser));
  };

  return { user, loading, refreshUser };
}
