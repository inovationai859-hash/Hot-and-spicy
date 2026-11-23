import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { signInWithRedirect, getRedirectResult } from 'firebase/auth';
import {
  auth,
  db,
  GoogleAuthProvider,
  OperationType,
  handleFirestoreError,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from '../firebase';
import {
  calculateOrderPoints,
  calculateLoyaltyFromOrders,
  getLoyaltyTier,
} from '../lib/loyalty';
import type {
  DietaryPreference,
  UserProfile,
  ReservationRequest,
  UserOrderRecord,
  LoyaltyRewardVoucher,
  LoyaltySummary,
} from '../types';

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export interface GoogleAuthPayload {
  mode: 'signin' | 'signup';
  is18Plus?: boolean;
  pendingIdToken?: string;
}

export interface GoogleAuthResult {
  needsAgeConfirmation?: boolean;
  pendingIdToken?: string;
  googleEmail?: string;
  googleName?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: 'signin' | 'signup';
  openAuthModal: (mode?: 'signin' | 'signup') => void;
  closeAuthModal: () => void;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    pass: string,
    name: string,
    address?: string,
    is18Plus?: boolean,
    phone?: string
  ) => Promise<void>;
  signInWithGoogle: (payload: GoogleAuthPayload) => Promise<GoogleAuthResult>;
  requestPasswordResetOtp: (email: string) => Promise<{ message: string; cooldownSeconds?: number }>;
  verifyPasswordResetOtp: (email: string, otp: string) => Promise<{ resetToken: string; message: string }>;
  resetPasswordWithOtp: (email: string, resetToken: string, newPassword: string) => Promise<{ message: string }>;
  signOutUser: () => Promise<void>;
  saveUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  saveBookingRecord: (booking: ReservationRequest) => Promise<string>;
  cancelBookingRecord: (bookingId: string) => Promise<void>;
  saveOrderRecord: (order: Omit<UserOrderRecord, 'id' | 'createdAt'>) => Promise<string>;
  redeemReward: (rewardId: string) => Promise<LoyaltyRewardVoucher>;
  recalculateLoyalty: (overrideOrders?: UserOrderRecord[]) => Promise<LoyaltySummary>;
  userBookings: ReservationRequest[];
  userOrders: UserOrderRecord[];
  loyalty: LoyaltySummary;
  dietaryPreference: DietaryPreference;
  updateDietaryPreference: (pref: DietaryPreference) => void;
  refreshHistory: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = 'hs_auth_token';
const DIETARY_PREF_KEY = 'hs_dietary_pref';
const VALID_FIRESTORE_ID = /^[a-zA-Z0-9_\-]+$/;

function parseDietaryPreference(value: unknown): DietaryPreference | undefined {
  return value === 'all' || value === 'veg' || value === 'non-veg' ? value : undefined;
}

function readLocalDietaryPreference(): DietaryPreference {
  try {
    return parseDietaryPreference(localStorage.getItem(DIETARY_PREF_KEY)) ?? 'all';
  } catch {
    return 'all';
  }
}

function writeLocalDietaryPreference(pref: DietaryPreference): void {
  try {
    localStorage.setItem(DIETARY_PREF_KEY, pref);
  } catch {}
}

function isFirestorePermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('permission') || msg.includes('insufficient');
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

const EMPTY_LOYALTY: LoyaltySummary = {
  earnedPoints: 0,
  spentPoints: 0,
  availablePoints: 0,
  vouchers: [],
};

async function syncUserProfileToFirestore(
  profile: UserProfile,
  summary?: LoyaltySummary,
  options?: { dietaryPreference?: DietaryPreference; throwOnPermissionError?: boolean }
): Promise<void> {
  if (!profile?.uid || !VALID_FIRESTORE_ID.test(profile.uid)) return;
  if (!auth.currentUser || auth.currentUser.uid !== profile.uid) return;

  const earnedPoints = Math.max(
    0,
    Math.floor(Number(summary?.earnedPoints ?? profile.earnedPoints) || 0)
  );
  const spentPoints = Math.max(
    0,
    Math.floor(Number(summary?.spentPoints ?? profile.spentPoints) || 0)
  );
  const availablePoints = Math.max(
    0,
    Math.floor(
      Number(
        summary?.availablePoints ??
          profile.loyaltyPoints ??
          Math.max(0, earnedPoints - spentPoints)
      ) || 0
    )
  );
  const validDietary =
    parseDietaryPreference(options?.dietaryPreference) ??
    parseDietaryPreference(profile.dietaryPreference);
  const loyaltyTier = (profile.loyaltyTier || getLoyaltyTier(earnedPoints).name).slice(0, 40);
  const nowIso = new Date().toISOString().slice(0, 50);

  try {
    await setDoc(
      doc(db, 'users', profile.uid),
      {
        uid: String(profile.uid).slice(0, 128),
        name: (String(profile.name || '').trim() || 'Hot & Spicy Guest').slice(0, 100),
        email: String(profile.email || '').trim().slice(0, 120),
        phone: String(profile.phone || '').slice(0, 20),
        phoneVerified: Boolean(profile.phoneVerified),
        authProvider:
          profile.authProvider === 'google' || profile.authProvider === 'phone'
            ? profile.authProvider
            : 'email',
        address: String(profile.address || '').slice(0, 250),
        is18Plus: Boolean(profile.is18Plus),
        ...(validDietary ? { dietaryPreference: validDietary } : {}),
        loyaltyPoints: availablePoints,
        earnedPoints,
        spentPoints,
        loyaltyTier,
        loyaltyUpdatedAt: (profile.loyaltyUpdatedAt || nowIso).slice(0, 50),
        createdAt: (profile.createdAt || nowIso).slice(0, 50),
        lastLoginAt: (profile.lastLoginAt || nowIso).slice(0, 50),
      },
      { merge: true }
    );
  } catch (err) {
    if (options?.throwOnPermissionError && isFirestorePermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}`);
    }
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [userBookings, setUserBookings] = useState<ReservationRequest[]>([]);
  const [userOrders, setUserOrders] = useState<UserOrderRecord[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltySummary>(EMPTY_LOYALTY);
  const [dietaryPreference, setDietaryPreferenceState] = useState<DietaryPreference>(() =>
    readLocalDietaryPreference()
  );
  const dietaryPrefRef = useRef<DietaryPreference>(dietaryPreference);
  const inFlightDietaryWritesRef = useRef(0);
  const loyaltyRef = useRef<LoyaltySummary>(loyalty);
  const userProfileRef = useRef<UserProfile | null>(userProfile);
  const userOrdersRef = useRef<UserOrderRecord[]>(userOrders);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const authGenRef = useRef(0);
  const authMutationActiveRef = useRef(false);

  userProfileRef.current = userProfile;
  userOrdersRef.current = userOrders;

  useEffect(() => {
    dietaryPrefRef.current = dietaryPreference;
  }, [dietaryPreference]);

  useEffect(() => {
    loyaltyRef.current = loyalty;
  }, [loyalty]);

  const applyServerSessionPayload = useCallback((data: any) => {
    const nextLoyalty: LoyaltySummary =
      data.loyalty && typeof data.loyalty === 'object'
        ? {
            earnedPoints: Number(data.loyalty.earnedPoints) || 0,
            spentPoints: Number(data.loyalty.spentPoints) || 0,
            availablePoints: Number(data.loyalty.availablePoints) || 0,
            vouchers: Array.isArray(data.loyalty.vouchers) ? data.loyalty.vouchers : [],
          }
        : EMPTY_LOYALTY;

    if (data.user) {
      setUserProfile(data.user);
      const serverPref = parseDietaryPreference(data.user.dietaryPreference);
      if (serverPref && inFlightDietaryWritesRef.current === 0) {
        dietaryPrefRef.current = serverPref;
        setDietaryPreferenceState(serverPref);
        writeLocalDietaryPreference(serverPref);
      }
      syncUserProfileToFirestore(data.user, nextLoyalty).catch(() => {});
    }
    if (Array.isArray(data.bookings)) setUserBookings(data.bookings);
    if (Array.isArray(data.orders)) setUserOrders(data.orders);
    if (data.loyalty && typeof data.loyalty === 'object') {
      setLoyalty(nextLoyalty);
    }
  }, []);

  const recoverBackendSessionFromFirebase = useCallback(
    async (expectedGen: number): Promise<{ token: string | null; fatalAuthError: boolean }> => {
      const fbUser = auth.currentUser;
      if (!fbUser) return { token: null, fatalAuthError: true };
      try {
        const idToken = await fbUser.getIdToken();
        if (!idToken || expectedGen !== authGenRef.current) {
          return { token: null, fatalAuthError: false };
        }
        const res = await fetch('/api/auth/firebase-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (!res.ok) {
          return {
            token: null,
            fatalAuthError: res.status === 401 || res.status === 403,
          };
        }
        if (expectedGen !== authGenRef.current) {
          return { token: null, fatalAuthError: false };
        }
        const data = await parseJsonSafe(res);
        if (!data?.token || !data?.user || expectedGen !== authGenRef.current) {
          return { token: null, fatalAuthError: false };
        }
        setStoredToken(data.token);
        applyServerSessionPayload(data);
        return { token: data.token as string, fatalAuthError: false };
      } catch {
        return { token: null, fatalAuthError: false };
      }
    },
    [applyServerSessionPayload]
  );

  const refreshHistory = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const run = (async () => {
      const gen = authGenRef.current;
      const token = getStoredToken();

      if (!token) {
        if (auth.currentUser) {
          const recovered = await recoverBackendSessionFromFirebase(gen);
          if (recovered.token || !recovered.fatalAuthError || gen !== authGenRef.current) return;
        }
        try {
          const ipRes = await fetch('/api/auth/ip-session');
          if (gen !== authGenRef.current) return;
          if (ipRes.ok) {
            const ipData = await parseJsonSafe(ipRes);
            if (gen !== authGenRef.current) return;
            if (ipData.autoLoggedIn && ipData.token && ipData.user) {
              setStoredToken(ipData.token);
              applyServerSessionPayload(ipData);
              return;
            }
          }
        } catch {}

        if (gen !== authGenRef.current) return;
        if (auth.currentUser) {
          const u = auth.currentUser;
          setUserProfile((prev) =>
            prev ?? {
              uid: u.uid,
              name: u.displayName || u.email?.split('@')[0] || 'Hot & Spicy Guest',
              email: u.email || '',
              phone: u.phoneNumber || '',
              phoneVerified: false,
              authProvider: u.providerData?.[0]?.providerId?.includes('google') ? 'google' : 'email',
              address: '',
              is18Plus: true,
              dietaryPreference: dietaryPrefRef.current,
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
            }
          );
          return;
        }

        setUserProfile(null);
        setUserBookings([]);
        setUserOrders([]);
        setLoyalty(EMPTY_LOYALTY);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (gen !== authGenRef.current) return;
        if (!res.ok) {
          if (res.status === 429 || res.status >= 500) {
            return;
          }
          if (res.status === 401 || res.status === 403) {
            if (auth.currentUser) {
              const recovered = await recoverBackendSessionFromFirebase(gen);
              if (recovered.token || !recovered.fatalAuthError || gen !== authGenRef.current) return;
            }
            if (gen !== authGenRef.current) return;
            setStoredToken(null);
            setUserProfile(null);
            setUserBookings([]);
            setUserOrders([]);
            setLoyalty(EMPTY_LOYALTY);
          }
          return;
        }
        const data = await parseJsonSafe(res);
        if (gen !== authGenRef.current) return;
        if (data?.user) {
          applyServerSessionPayload(data);
        }
      } catch {}
    })();

    inFlightRefreshRef.current = run;
    try {
      await run;
    } finally {
      if (inFlightRefreshRef.current === run) {
        inFlightRefreshRef.current = null;
      }
    }
  }, [applyServerSessionPayload, recoverBackendSessionFromFirebase]);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          const u = result.user;
          setFirebaseUid(u.uid);
          const profile: UserProfile = {
            uid: u.uid,
            name: u.displayName || 'Google User',
            email: u.email || '',
            phone: u.phoneNumber || '',
            phoneVerified: false,
            authProvider: 'google',
            address: '',
            is18Plus: true,
            dietaryPreference: dietaryPrefRef.current,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          setUserProfile(profile);
          void syncUserProfileToFirestore(profile, loyaltyRef.current);
          setIsAuthModalOpen(false);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((fbUser) => {
      setFirebaseUid(fbUser?.uid ?? null);
      if (fbUser && !getStoredToken() && !authMutationActiveRef.current) {
        void refreshHistory();
      }
    });
    return () => unsubscribe();
  }, [refreshHistory]);

  useEffect(() => {
    let active = true;
    (async () => {
      await refreshHistory();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshHistory]);

  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid || !firebaseUid || firebaseUid !== uid || !VALID_FIRESTORE_ID.test(uid)) {
      return;
    }

    const userDocPath = `users/${uid}`;
    const userDocRef = doc(db, 'users', uid);

    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (inFlightDietaryWritesRef.current > 0) return;

        const currentProfile = userProfileRef.current;
        if (!snapshot.exists()) {
          if (currentProfile && currentProfile.uid === uid) {
            syncUserProfileToFirestore(currentProfile, loyaltyRef.current, {
              dietaryPreference:
                parseDietaryPreference(currentProfile.dietaryPreference) ?? dietaryPrefRef.current,
            }).catch(() => {});
          }
          return;
        }

        const remoteData = snapshot.data();
        const remotePref = parseDietaryPreference(remoteData?.dietaryPreference);

        if (remotePref) {
          if (remotePref !== dietaryPrefRef.current) {
            dietaryPrefRef.current = remotePref;
            setDietaryPreferenceState(remotePref);
            writeLocalDietaryPreference(remotePref);
          }
          setUserProfile((prev) =>
            prev && prev.uid === uid && prev.dietaryPreference !== remotePref
              ? { ...prev, dietaryPreference: remotePref }
              : prev
          );
        }

        if (!snapshot.metadata.hasPendingWrites && currentProfile && currentProfile.uid === uid) {
          const needsBackfill =
            !remotePref ||
            (Boolean(currentProfile.email) && !remoteData?.email) ||
            (Boolean(currentProfile.phone) && !remoteData?.phone) ||
            (Boolean(currentProfile.address) && !remoteData?.address);
          if (needsBackfill) {
            const seedPref =
              parseDietaryPreference(currentProfile.dietaryPreference) ?? dietaryPrefRef.current;
            syncUserProfileToFirestore(currentProfile, loyaltyRef.current, {
              dietaryPreference: seedPref,
            }).catch(() => {});
          }
        }
      },
      (error) => {
        if (isFirestorePermissionError(error)) {
          handleFirestoreError(error, OperationType.GET, userDocPath);
        }
      }
    );

    return () => unsubscribe();
  }, [userProfile?.uid, firebaseUid]);

  const openAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    authGenRef.current += 1;
    authMutationActiveRef.current = true;
    try {
      const cleanEmail = email.trim();
      let signedInViaBackend = false;

      try {
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: pass }),
        });
        const data = await parseJsonSafe(res);
        if (res.ok && data?.token && data?.user) {
          setStoredToken(data.token);
          setUserProfile(data.user);
          signedInViaBackend = true;
        }
      } catch {}

      if (!signedInViaBackend) {
        const fbCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
        const fbUser = fbCred.user;
        const fallbackProfile: UserProfile = {
          uid: fbUser.uid,
          name: fbUser.displayName || cleanEmail.split('@')[0] || 'Hot & Spicy Guest',
          email: fbUser.email || cleanEmail,
          phone: fbUser.phoneNumber || '',
          phoneVerified: false,
          authProvider: 'email',
          address: '',
          is18Plus: true,
          dietaryPreference: dietaryPrefRef.current,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        setUserProfile(fallbackProfile);
        await syncUserProfileToFirestore(fallbackProfile, loyaltyRef.current).catch(() => {});
      }

      await refreshHistory();
      closeAuthModal();
    } finally {
      authMutationActiveRef.current = false;
    }
  }, [refreshHistory, closeAuthModal]);

  const signUpWithEmail = useCallback(async (
    email: string,
    pass: string,
    name: string,
    address?: string,
    is18Plus?: boolean,
    phone?: string
  ) => {
    authGenRef.current += 1;
    authMutationActiveRef.current = true;
    try {
      const cleanEmail = email.trim();
      const cleanPhone = (phone || '').trim();
      let createdViaBackend = false;

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify
