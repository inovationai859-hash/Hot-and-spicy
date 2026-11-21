import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
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
    // Non-fatal background mirror; authoritative customer record also lives on backend
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
        const data = await res.json();
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
            const ipData = await ipRes.json();
            if (gen !== authGenRef.current) return;
            if (ipData.autoLoggedIn && ipData.token && ipData.user) {
              setStoredToken(ipData.token);
              applyServerSessionPayload(ipData);
              return;
            }
          }
        } catch {
          // Ignore auto-login probe errors cleanly
        }
        if (gen !== authGenRef.current) return;
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
          // Never log the user out on transient rate-limit (429) or server errors (5xx)
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
        const data = await res.json();
        if (gen !== authGenRef.current) return;
        applyServerSessionPayload(data);
      } catch {
        // Non-fatal network hiccup: keep current signed-in state intact
      }
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

  // Real-time Firestore listener on /users/{uid} for cross-device profile & dietary preference sync
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

        // Backfill missing email/phone/address/dietaryPreference onto Firestore user doc if backend profile has newer contact info
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
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to sign in. Please verify your details.');
      }
      let activeToken: string = data.token;
      let activeUser: UserProfile = data.user;
      setStoredToken(activeToken);
      setUserProfile(activeUser);

      // Establish Firebase Auth session non-fatally & link UID if needed so Firestore sync always works
      try {
        const fbCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
        if (fbCred?.user && activeUser && fbCred.user.uid !== activeUser.uid) {
          const idToken = await fbCred.user.getIdToken();
          const linkRes = await fetch('/api/auth/link-firebase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${activeToken}`,
            },
            body: JSON.stringify({ idToken }),
          });
          if (linkRes.ok) {
            const linkData = await linkRes.json();
            if (linkData.token && linkData.user) {
              activeToken = linkData.token;
              activeUser = linkData.user;
              setStoredToken(activeToken);
              setUserProfile(activeUser);
            }
          }
        }
      } catch {}

      if (activeUser) {
        await syncUserProfileToFirestore(activeUser, loyaltyRef.current).catch(() => {});
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
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: pass,
          name: name.trim(),
          phone: cleanPhone,
          address: address || '',
          is18Plus: Boolean(is18Plus),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to create account. Please try again.');
      }

      let activeToken: string = data.token;
      let activeUser: UserProfile = data.user;
      setStoredToken(activeToken);
      setUserProfile(activeUser);
      setUserBookings([]);
      setUserOrders([]);
      setLoyalty(EMPTY_LOYALTY);

      try {
        let fbCred;
        if (data.firebaseCreated) {
          fbCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
        } else {
          fbCred = await createUserWithEmailAndPassword(auth, cleanEmail, pass).catch(() =>
            signInWithEmailAndPassword(auth, cleanEmail, pass)
          );
        }
        if (fbCred?.user && activeUser && fbCred.user.uid !== activeUser.uid) {
          const idToken = await fbCred.user.getIdToken();
          const linkRes = await fetch('/api/auth/link-firebase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${activeToken}`,
            },
            body: JSON.stringify({ idToken }),
          });
          if (linkRes.ok) {
            const linkData = await linkRes.json();
            if (linkData.token && linkData.user) {
              activeToken = linkData.token;
              activeUser = linkData.user;
              setStoredToken(activeToken);
            }
          }
        }
      } catch {
        // Continue cleanly with backend session if Firebase Email/Password provider is disabled
      }

      const localPref = dietaryPrefRef.current;
      if (activeUser) {
        const nextUser: UserProfile = {
          ...activeUser,
          dietaryPreference: activeUser.dietaryPreference ?? localPref,
        };
        setUserProfile(nextUser);
        await syncUserProfileToFirestore(nextUser, EMPTY_LOYALTY, {
          dietaryPreference: nextUser.dietaryPreference,
        }).catch(() => {});
        await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify({ dietaryPreference: nextUser.dietaryPreference }),
        }).catch(() => {});
      }
      await refreshHistory();
      closeAuthModal();
    } finally {
      authMutationActiveRef.current = false;
    }
  }, [refreshHistory, closeAuthModal]);

  const signInWithGoogle = useCallback(
    async ({ mode, is18Plus, pendingIdToken }: GoogleAuthPayload): Promise<GoogleAuthResult> => {
      if (mode === 'signup' && !is18Plus) {
        throw new Error('Please confirm that you are 18 years or older to create an account with Google.');
      }

      authGenRef.current += 1;
      authMutationActiveRef.current = true;
      try {
        let idToken = pendingIdToken;
        if (!idToken) {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          const credential = await signInWithPopup(auth, provider);
          idToken = await credential.user.getIdToken();
        }

        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            mode,
            is18Plus: Boolean(is18Plus),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          auth.signOut().catch(() => {});
          throw new Error(data.error || 'Unable to complete Google authentication.');
        }

        if (data.needsAgeConfirmation) {
          return {
            needsAgeConfirmation: true,
            pendingIdToken: idToken,
            googleEmail: typeof data.googleEmail === 'string' ? data.googleEmail : undefined,
            googleName: typeof data.googleName === 'string' ? data.googleName : undefined,
          };
        }

        setStoredToken(data.token);
        setUserProfile(data.user);
        if (data.user) {
          const initialPref = parseDietaryPreference(data.user.dietaryPreference) ?? dietaryPrefRef.current;
          const nextUser: UserProfile = { ...data.user, dietaryPreference: initialPref };
          setUserProfile(nextUser);
          await syncUserProfileToFirestore(nextUser, EMPTY_LOYALTY, {
            dietaryPreference: initialPref,
          }).catch(() => {});
          if (data.isNewUser) {
            fetch('/api/auth/profile', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${data.token}`,
              },
              body: JSON.stringify({ dietaryPreference: initialPref }),
            }).catch(() => {});
          }
        }
        await refreshHistory();
        closeAuthModal();
        return { needsAgeConfirmation: false };
      } finally {
        authMutationActiveRef.current = false;
      }
    },
    [refreshHistory, closeAuthModal]
  );

  const requestPasswordResetOtp = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/forgot-password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to send OTP to your email right now.');
    }
    return {
      message: String(data.message || 'Verification code sent to your email.'),
      cooldownSeconds: Number(data.cooldownSeconds) || 60,
    };
  }, []);

  const verifyPasswordResetOtp = useCallback(async (email: string, otp: string) => {
    const res = await fetch('/api/auth/forgot-password/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired OTP code.');
    }
    return {
      resetToken: String(data.resetToken || ''),
      message: String(data.message || 'OTP verified.'),
    };
  }, []);

  const resetPasswordWithOtp = useCallback(
    async (email: string, resetToken: string, newPassword: string) => {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          resetToken,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to update your password.');
      }
      return {
        message: String(data.message || 'Password updated successfully.'),
      };
    },
    []
  );

  const signOutUser = useCallback(async () => {
    authGenRef.current += 1;
    const token = getStoredToken();
    setStoredToken(null);
    setUserProfile(null);
    setUserBookings([]);
    setUserOrders([]);
    setLoyalty(EMPTY_LOYALTY);
    auth.signOut().catch(() => {});
    if (token) {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }, []);

  const updateDietaryPreference = useCallback(
    (nextPref: DietaryPreference) => {
      const cleanPref = parseDietaryPreference(nextPref);
      if (!cleanPref) return;

      dietaryPrefRef.current = cleanPref;
      setDietaryPreferenceState(cleanPref);
      writeLocalDietaryPreference(cleanPref);

      if (!userProfile) return;

      const updatedProfile: UserProfile = {
        ...userProfile,
        dietaryPreference: cleanPref,
      };
      setUserProfile((prev) =>
        prev ? { ...prev, dietaryPreference: cleanPref } : prev
      );

      inFlightDietaryWritesRef.current += 1;
      const finishWrite = () => {
        inFlightDietaryWritesRef.current = Math.max(0, inFlightDietaryWritesRef.current - 1);
      };

      const persistTasks: Promise<unknown>[] = [];

      if (
        auth.currentUser &&
        auth.currentUser.uid === userProfile.uid &&
        VALID_FIRESTORE_ID.test(userProfile.uid)
      ) {
        persistTasks.push(
          syncUserProfileToFirestore(updatedProfile, loyaltyRef.current, {
            dietaryPreference: cleanPref,
            throwOnPermissionError: true,
          }).catch((err) => {
            console.error('Firestore dietary preference sync error:', err);
          })
        );
      }

      const token = getStoredToken();
      if (token) {
        persistTasks.push(
          fetch('/api/auth/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ dietaryPreference: cleanPref }),
          }).catch(() => {})
        );
      }

      void Promise.allSettled(persistTasks).finally(finishWrite);
    },
    [userProfile]
  );

  const saveUserProfile = useCallback(async (data: Partial<UserProfile>) => {
    const token = getStoredToken();
    if (!token) {
      throw new Error('Please sign in to update your profile.');
    }

    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || 'Unable to update profile. Please check your details.');
    }
    if (json.user) {
      const mergedUser: UserProfile = {
        ...json.user,
        dietaryPreference:
          parseDietaryPreference(json.user.dietaryPreference) ??
          parseDietaryPreference(data.dietaryPreference) ??
          dietaryPrefRef.current,
      };
      setUserProfile(mergedUser);
      const nextPref = parseDietaryPreference(mergedUser.dietaryPreference);
      if (nextPref && inFlightDietaryWritesRef.current === 0) {
        dietaryPrefRef.current = nextPref;
        setDietaryPreferenceState(nextPref);
        writeLocalDietaryPreference(nextPref);
      }
      await syncUserProfileToFirestore(mergedUser, loyaltyRef.current);
    }
  }, []);

  const saveBookingRecord = useCallback(async (booking: ReservationRequest): Promise<string> => {
    let token = getStoredToken();
    if (!token && auth.currentUser) {
      const recovered = await recoverBackendSessionFromFirebase(authGenRef.current);
      token = recovered.token;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers,
      body: JSON.stringify(booking),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to log reservation.');
    }
    const createdAt = data.details?.createdAt || new Date().toISOString();
    const created: ReservationRequest = {
      ...booking,
      ...(data.details || {}),
      id: data.reservationId,
      createdAt,
    };
    setUserBookings((prev) => [created, ...prev]);

    const currentProfile = userProfileRef.current;
    if (auth.currentUser && currentProfile?.uid && auth.currentUser.uid === currentProfile.uid && data.reservationId) {
      setDoc(doc(db, 'bookings', data.reservationId), {
        id: String(data.reservationId).slice(0, 128),
        userId: auth.currentUser.uid,
        name: (booking.name || currentProfile.name || 'Hot & Spicy Guest').trim().slice(0, 100),
        phone: (booking.phone || currentProfile.phone || '').trim().slice(0, 20),
        address: (booking.address || currentProfile.address || '').trim().slice(0, 250),
        bookingType: booking.bookingType,
        ...(booking.bookingType === 'pool' && booking.poolDuration ? { poolDuration: booking.poolDuration } : {}),
        date: String(created.date || booking.date).slice(0, 20),
        timeSlot: String(created.timeSlot || booking.timeSlot).slice(0, 20),
        guests: Math.max(1, Math.min(30, Number(booking.guests) || 2)),
        specialRequests: (booking.specialRequests || '').trim().slice(0, 300),
        status: 'Confirmed',
        is18Confirmed: true,
        createdAt: String(createdAt).slice(0, 50),
      }).catch(() => {});
    }

    let nextLoyalty = loyaltyRef.current;
    if (data.loyalty && typeof data.loyalty === 'object') {
      nextLoyalty = {
        earnedPoints: Number(data.loyalty.earnedPoints) || 0,
        spentPoints: Number(data.loyalty.spentPoints) || 0,
        availablePoints: Number(data.loyalty.availablePoints) || 0,
        vouchers: Array.isArray(data.loyalty.vouchers) ? data.loyalty.vouchers : [],
      };
      setLoyalty(nextLoyalty);
    }

    const updatedProfile: UserProfile | null = data.user
      ? data.user
      : currentProfile
      ? {
          ...currentProfile,
          phone: currentProfile.phone || booking.phone || '',
          address: currentProfile.address || booking.address || '',
        }
      : null;

    if (updatedProfile) {
      setUserProfile(updatedProfile);
      await syncUserProfileToFirestore(updatedProfile, nextLoyalty);
    }
    return data.reservationId;
  }, [recoverBackendSessionFromFirebase]);

  const cancelBookingRecord = useCallback(async (bookingId: string): Promise<void> => {
    const cleanId = String(bookingId || '').trim();
    if (!cleanId) {
      throw new Error('Missing booking reference ID.');
    }

    const currentUid = userProfileRef.current?.uid;
    if (
      auth.currentUser &&
      currentUid &&
      auth.currentUser.uid === currentUid &&
      VALID_FIRESTORE_ID.test(cleanId)
    ) {
      const bookingPath = `bookings/${cleanId}`;
      try {
        await updateDoc(doc(db, 'bookings', cleanId), { status: 'Cancelled' });
      } catch (err) {
        if (isFirestorePermissionError(err)) {
          handleFirestoreError(err, OperationType.UPDATE, bookingPath);
        }
        const errCode = (err as { code?: string })?.code;
        if (errCode !== 'not-found') {
          handleFirestoreError(err, OperationType.UPDATE, bookingPath);
        }
      }
    }

    const token = getStoredToken();
    if (token) {
      const res = await fetch(`/api/reservations/${encodeURIComponent(cleanId)}/cancel`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok && res.status !== 404) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Unable to cancel reservation right now.');
      }
    }

    setUserBookings((prev) =>
      prev.map((b) => (b.id === cleanId ? { ...b, status: 'Cancelled' } : b))
    );
  }, []);

  const saveOrderRecord = useCallback(async (
    order: Omit<UserOrderRecord, 'id' | 'createdAt'>
  ): Promise<string> => {
    let token = getStoredToken();
    if (!token && auth.currentUser) {
      const recovered = await recoverBackendSessionFromFirebase(authGenRef.current);
      token = recovered.token;
    }

    const submitOrder = async (authToken: string | null) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      return fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(order),
      });
    };

    let res = await submitOrder(token);
    if (res.status === 401 && auth.currentUser) {
      const recovered = await recoverBackendSessionFromFirebase(authGenRef.current);
      if (recovered.token) {
        token = recovered.token;
        res = await submitOrder(recovered.token);
      }
    }

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setStoredToken(null);
      }
      throw new Error(data.error || 'Failed to log order.');
    }
    const createdAt = data.details?.createdAt || new Date().toISOString();
    const initialStatus = data.details?.status || 'Pending';

    const currentProfile = userProfileRef.current;
    // Non-blocking Firestore mirror for live owner-isolated tracking
    if (auth.currentUser && currentProfile?.uid && auth.currentUser.uid === currentProfile.uid && data.orderId) {
      const safeAddress =
        String(order.address || '').trim() ||
        (order.diningMode === 'dine-in' ? 'Lounge Table' : 'Takeaway Counter');
      setDoc(doc(db, 'orders', data.orderId), {
        id: data.orderId,
        userId: auth.currentUser.uid,
        customerEmail: String(currentProfile.email || '').slice(0, 120),
        customerName: String(order.customerName || currentProfile.name || 'Guest').trim().slice(0, 100),
        phone: String(order.phone || currentProfile.phone || '').trim().slice(0, 20),
        address: safeAddress.slice(0, 250),
        diningMode: order.diningMode === 'dine-in' ? 'dine-in' : 'takeaway',
        itemsSummary: String(order.itemsSummary || '').slice(0, 2000),
        subtotal: Math.max(0, Number(order.subtotal) || 0),
        status: initialStatus,
        is18Confirmed: true,
        createdAt,
        updatedAt: createdAt,
      }).catch(() => {});
    }

    const created: UserOrderRecord = {
      ...order,
      id: data.orderId,
      status: initialStatus,
      createdAt,
    };
    setUserOrders((prev) => [created, ...prev]);

    const currentLoyalty = loyaltyRef.current;
    let nextLoyalty: LoyaltySummary;
    if (data.loyalty && typeof data.loyalty === 'object') {
      nextLoyalty = {
        earnedPoints: Number(data.loyalty.earnedPoints) || 0,
        spentPoints: Number(data.loyalty.spentPoints) || 0,
        availablePoints: Number(data.loyalty.availablePoints) || 0,
        vouchers: Array.isArray(data.loyalty.vouchers) ? data.loyalty.vouchers : [],
      };
    } else {
      const earnedDelta = calculateOrderPoints(order.subtotal, initialStatus);
      const nextEarned = currentLoyalty.earnedPoints + earnedDelta;
      nextLoyalty = {
        ...currentLoyalty,
        earnedPoints: nextEarned,
        availablePoints: Math.max(0, nextEarned - currentLoyalty.spentPoints),
      };
    }
    setLoyalty(nextLoyalty);

    const updatedProfile: UserProfile | null = data.user
      ? {
          ...data.user,
          phone: data.user.phone || order.phone || currentProfile?.phone || '',
          address: data.user.address || order.address || currentProfile?.address || '',
        }
      : currentProfile
      ? {
          ...currentProfile,
          phone: currentProfile.phone || order.phone || '',
          address: currentProfile.address || order.address || '',
          loyaltyPoints: nextLoyalty.availablePoints,
          earnedPoints: nextLoyalty.earnedPoints,
          spentPoints: nextLoyalty.spentPoints,
          loyaltyTier: getLoyaltyTier(nextLoyalty.earnedPoints).name,
          loyaltyUpdatedAt: createdAt,
        }
      : null;

    if (updatedProfile) {
      setUserProfile(updatedProfile);
      await syncUserProfileToFirestore(updatedProfile, nextLoyalty);
    }

    return data.orderId;
  }, [recoverBackendSessionFromFirebase]);

  const recalculateLoyalty = useCallback(
    async (overrideOrders?: UserOrderRecord[]): Promise<LoyaltySummary> => {
      const token = getStoredToken();
      let serverUser: UserProfile | null = userProfileRef.current;
      let serverOrders: UserOrderRecord[] = userOrdersRef.current;
      let serverVouchers: LoyaltyRewardVoucher[] = loyaltyRef.current.vouchers;

      if (token) {
        const res = await fetch('/api/auth/loyalty/recalculate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) serverUser = data.user;
          if (Array.isArray(data.orders)) serverOrders = data.orders;
          if (data.loyalty && Array.isArray(data.loyalty.vouchers)) {
            serverVouchers = data.loyalty.vouchers;
          }
        }
      }

      // Merge server order history with any Firestore-synced order records cleanly by id
      const orderMap = new Map<string, UserOrderRecord>();
      for (const o of serverOrders) {
        orderMap.set(o.id, o);
      }
      if (Array.isArray(overrideOrders)) {
        for (const o of overrideOrders) {
          orderMap.set(o.id, o);
        }
      }
      const combinedOrders = Array.from(orderMap.values());
      const calc = calculateLoyaltyFromOrders(combinedOrders, serverVouchers);
      const nowIso = new Date().toISOString();

      const nextLoyalty: LoyaltySummary = {
        earnedPoints: calc.earnedPoints,
        spentPoints: calc.spentPoints,
        availablePoints: calc.availablePoints,
        vouchers: serverVouchers,
      };
      setLoyalty(nextLoyalty);

      if (serverUser) {
        const updatedProfile: UserProfile = {
          ...serverUser,
          loyaltyPoints: calc.availablePoints,
          earnedPoints: calc.earnedPoints,
          spentPoints: calc.spentPoints,
          loyaltyTier: calc.tierName,
          loyaltyUpdatedAt: nowIso,
        };
        setUserProfile(updatedProfile);
        await syncUserProfileToFirestore(updatedProfile, nextLoyalty);
      }

      return nextLoyalty;
    },
    []
  );

  const redeemReward = useCallback(async (rewardId: string): Promise<LoyaltyRewardVoucher> => {
    const token = getStoredToken();
    if (!token) {
      throw new Error('Please sign in to redeem loyalty rewards.');
    }

    const res = await fetch('/api/rewards/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rewardId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to redeem reward right now.');
    }

    let nextLoyalty = loyalty;
    if (data.loyalty && typeof data.loyalty === 'object') {
      nextLoyalty = {
        earnedPoints: Number(data.loyalty.earnedPoints) || 0,
        spentPoints: Number(data.loyalty.spentPoints) || 0,
        availablePoints: Number(data.loyalty.availablePoints) || 0,
        vouchers: Array.isArray(data.loyalty.vouchers) ? data.loyalty.vouchers : [],
      };
      setLoyalty(nextLoyalty);
    }

    const updatedProfile: UserProfile | null = data.user
      ? data.user
      : userProfile
      ? {
          ...userProfile,
          loyaltyPoints: nextLoyalty.availablePoints,
          earnedPoints: nextLoyalty.earnedPoints,
          spentPoints: nextLoyalty.spentPoints,
          loyaltyTier: getLoyaltyTier(nextLoyalty.earnedPoints).name,
          loyaltyUpdatedAt: new Date().toISOString(),
        }
      : null;

    if (updatedProfile) {
      setUserProfile(updatedProfile);
      await syncUserProfileToFirestore(updatedProfile, nextLoyalty);
    }

    return data.voucher as LoyaltyRewardVoucher;
  }, [loyalty, userProfile]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user: userProfile,
      userProfile,
      loading,
      isAuthModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      requestPasswordResetOtp,
      verifyPasswordResetOtp,
      resetPasswordWithOtp,
      signOutUser,
      saveUserProfile,
      saveBookingRecord,
      cancelBookingRecord,
      saveOrderRecord,
      redeemReward,
      recalculateLoyalty,
      userBookings,
      userOrders,
      loyalty,
      dietaryPreference,
      updateDietaryPreference,
      refreshHistory,
    }),
    [
      userProfile,
      loading,
      isAuthModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      requestPasswordResetOtp,
      verifyPasswordResetOtp,
      resetPasswordWithOtp,
      signOutUser,
      saveUserProfile,
      saveBookingRecord,
      cancelBookingRecord,
      saveOrderRecord,
      redeemReward,
      recalculateLoyalty,
      userBookings,
      userOrders,
      loyalty,
      dietaryPreference,
      updateDietaryPreference,
      refreshHistory,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
