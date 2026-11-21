import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  AlertCircle,
  LogIn,
  UserPlus,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDialogKeyboard, scrollFocusedInputIntoView } from '../hooks/useDialogKeyboard';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function getPasswordStrength(pwd: string): {
  label: 'Weak' | 'Fair' | 'Strong';
  score: number;
  barClass: string;
  textClass: string;
} {
  if (!pwd) {
    return { label: 'Weak', score: 0, barClass: 'bg-neutral-300', textClass: 'text-neutral-500' };
  }
  let pts = 0;
  if (pwd.length >= 6) pts += 1;
  if (pwd.length >= 8) pts += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) pts += 1;
  if (/\d/.test(pwd)) pts += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) pts += 1;

  if (pts >= 4) {
    return { label: 'Strong', score: 100, barClass: 'bg-emerald-600', textClass: 'text-emerald-700' };
  }
  if (pts >= 2 && pwd.length >= 6) {
    return { label: 'Fair', score: 62, barClass: 'bg-amber-500', textClass: 'text-amber-700' };
  }
  return { label: 'Weak', score: 28, barClass: 'bg-rose-500', textClass: 'text-rose-700' };
}

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    authModalMode,
    closeAuthModal,
    openAuthModal,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    requestPasswordResetOtp,
    verifyPasswordResetOtp,
    resetPasswordWithOtp,
  } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogKeyboard(isAuthModalOpen, closeAuthModal, dialogRef);

  // Shared UI & status state
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Profile / Email & Password fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [address, setAddress] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [is18Plus, setIs18Plus] = useState(false);

  // Google Sign-In / Sign-Up state
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Forgot Password (3-Step Email OTP) state
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState('');
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const resetForgotFlow = () => {
    setIsForgotMode(false);
    setForgotStep('email');
    setForgotEmail('');
    setForgotOtp('');
    setForgotResetToken('');
    setForgotCooldown(0);
    setNewPassword('');
    setConfirmNewPassword('');
  };

  useEffect(() => {
    setErrorMsg('');
    setInfoMsg('');
    setSubmitting(false);
    setGoogleSubmitting(false);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setAddress('');
    setSignupPhone('');
    setIs18Plus(false);
    resetForgotFlow();
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setForgotCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotCooldown]);

  const handleModeSwitch = (mode: 'signin' | 'signup') => {
    setErrorMsg('');
    setInfoMsg('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    resetForgotFlow();
    openAuthModal(mode);
  };

  const handleEmailSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(cleanEmail, password);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to sign in. Please verify your details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async (mode: 'signin' | 'signup') => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle({
        mode,
        is18Plus: true,
      });
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('popup-closed-by-user')) {
        setErrorMsg('Google window was closed before completing sign-in.');
      } else {
        setErrorMsg(msg || 'Unable to continue with Google right now.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleOpenForgotPassword = () => {
    setErrorMsg('');
    setInfoMsg('');
    setShowPassword(false);
    setIsForgotMode(true);
    setForgotStep('email');
    setForgotEmail(email.trim());
    setForgotOtp('');
    setForgotResetToken('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleRequestEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanTarget = forgotEmail.trim();
    if (!EMAIL_REGEX.test(cleanTarget)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestPasswordResetOtp(cleanTarget);
      setForgotEmail(cleanTarget);
      setForgotStep('otp');
      setForgotOtp('');
      setForgotCooldown(res.cooldownSeconds || 60);
      setInfoMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to send OTP to your email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanOtp = forgotOtp.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP sent to your email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyPasswordResetOtp(forgotEmail.trim(), cleanOtp);
      setForgotResetToken(res.resetToken);
      setForgotStep('reset');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPassword(false);
      setInfoMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Invalid or expired OTP code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (newPassword.trim().length < 6) {
      setErrorMsg('New password must be at least 6 non-space characters.');
      return;
    }
    if (newPassword.length > 128) {
      setErrorMsg('Password must be 128 characters or fewer.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await resetPasswordWithOtp(forgotEmail.trim(), forgotResetToken, newPassword);
      const updatedEmail = forgotEmail.trim();
      resetForgotFlow();
      setEmail(updatedEmail);
      setPassword('');
      setShowPassword(false);
      setInfoMsg(res.message || 'Password updated! Sign in with your new password.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update password right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.trim().length < 6) {
      setErrorMsg('Password must be at least 6 non-space characters.');
      return;
    }
    if (password.length > 128) {
      setErrorMsg('Password must be 128 characters or fewer.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!is18Plus) {
      setErrorMsg('Please confirm you are 18 years or older to create an account.');
      return;
    }

    setSubmitting(true);
    try {
      const cleanDigits = signupPhone.replace(/\D/g, '').slice(-10);
      const formattedPhone = cleanDigits.length === 10 ? `+91 ${cleanDigits}` : '';
      await signUpWithEmail(trimmedEmail, password, name.trim(), address.trim(), true, formattedPhone);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword;
  const passwordsMismatch = Boolean(confirmPassword) && password !== confirmPassword;

  return (
    <AnimatePresence>
      {isAuthModalOpen && (
        <motion.div
          key="auth-backdrop"
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closeAuthModal}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[1120] flex items-center justify-center p-3 sm:p-4 bg-[rgba(0,0,0,0.75)] overscroll-none"
        >
          <motion.div
            ref={dialogRef}
            key="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl bg-white border border-neutral-200 shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90dvh] flex flex-col text-black focus:outline-none"
          >
            {/* Header */}
            <div className="shrink-0 p-5 sm:p-6 bg-white border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 id="auth-modal-title" className="font-luxury text-xl sm:text-2xl font-bold text-black">
                  {authModalMode === 'signin'
                    ? isForgotMode
                      ? 'Reset Password'
                      : 'Welcome Back'
                    : 'Create Account'}
                </h3>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {authModalMode === 'signin'
                    ? isForgotMode
                      ? 'Verify your email with a 6-digit OTP to set a new password'
                      : 'Sign in with Google or your email & password'
                    : 'Continue with Google or create an account with your email'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAuthModal}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-neutral-700 hover:text-black hover:bg-neutral-100 border border-transparent hover:border-neutral-200 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div
              data-lenis-prevent
              data-dialog-scroll
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onFocusCapture={scrollFocusedInputIntoView}
              className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain space-y-4 bg-white text-black"
            >
              {/* Primary Sign In / Sign Up Switcher */}
              <div className="grid grid-cols-2 p-1 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('signin')}
                  className={`min-h-[40px] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                    authModalMode === 'signin'
                      ? 'bg-black text-white shadow-xs'
                      : 'text-neutral-700 hover:text-black'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('signup')}
                  className={`min-h-[40px] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                    authModalMode === 'signup'
                      ? 'bg-black text-white shadow-xs'
                      : 'text-neutral-700 hover:text-black'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Sign Up
                </button>
              </div>

              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}

              {infoMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </motion.div>
              )}

              {/* SIGN IN FLOW */}
              {authModalMode === 'signin' ? (
                isForgotMode ? (
                  <div className="space-y-4 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setInfoMsg('');
                        resetForgotFlow();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-black hover:text-neutral-700 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Sign In
                    </button>

                    {forgotStep === 'email' && (
                      <form onSubmit={handleRequestEmailOtp} autoComplete="off" className="space-y-3.5">
                        <div>
                          <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-neutral-700" />
                            <span>Registered Email Address *</span>
                          </label>
                          <input
                            type="email"
                            autoComplete="email"
                            required
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                          />
                          <p className="text-[11px] text-neutral-600 mt-1.5 leading-relaxed">
                            We will send a 6-digit verification code directly to the email address you enter.
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {submitting ? 'Sending OTP...' : 'Send Email OTP'}
                        </button>
                      </form>
                    )}

                    {forgotStep === 'otp' && (
                      <form onSubmit={handleVerifyEmailOtp} autoComplete="off" className="space-y-3.5">
                        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-300 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className="font-bold text-black flex items-center gap-1.5">
                              <KeyRound className="w-3.5 h-3.5 text-black" />
                              <span>Enter 6-Digit Email OTP *</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMsg('');
                                setInfoMsg('');
                                setForgotStep('email');
                                setForgotOtp('');
                              }}
                              className="text-[11px] font-semibold text-neutral-700 hover:text-black underline cursor-pointer"
                            >
                              Change Email
                            </button>
                          </div>

                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            required
                            value={forgotOtp}
                            onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="• • • • • •"
                            className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[46px] text-center font-mono text-lg tracking-[0.45em] font-bold text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                          />

                          <div className="flex items-center justify-between text-[11px] text-neutral-600 gap-2">
                            <span className="truncate">Code sent to {forgotEmail}</span>
                            <button
                              type="button"
                              disabled={forgotCooldown > 0 || submitting}
                              onClick={() => handleRequestEmailOtp()}
                              className="inline-flex items-center gap-1 font-bold text-black disabled:text-neutral-400 hover:underline cursor-pointer disabled:cursor-not-allowed shrink-0"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {forgotCooldown > 0 ? `Resend in ${forgotCooldown}s` : 'Resend OTP'}
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={submitting || forgotOtp.length !== 6}
                          className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {submitting ? 'Verifying Code...' : 'Verify Email OTP'}
                        </button>
                      </form>
                    )}

                    {forgotStep === 'reset' && (
                      <form onSubmit={handleResetPasswordSubmit} autoComplete="off" className="space-y-3.5">
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center gap-2 text-emerald-950 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="truncate">Verified: {forgotEmail}</span>
                        </div>

                        <div>
                          <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-neutral-700" />
                            <span>New Password *</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              minLength={6}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Minimum 6 characters"
                              className="w-full bg-white border border-neutral-300 rounded-xl pl-3.5 pr-11 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((prev) => !prev)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-600 hover:text-black cursor-pointer"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-neutral-700" />
                            <span>Confirm New Password *</span>
                          </label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            minLength={6}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="Re-enter your new password"
                            className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {submitting ? 'Updating Password...' : 'Change Password'}
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <button
                      type="button"
                      disabled={googleSubmitting || submitting}
                      onClick={() => handleGoogleAuth('signin')}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-300 text-black font-bold text-xs flex items-center justify-center gap-2.5 shadow-xs cursor-pointer disabled:opacity-55"
                    >
                      <GoogleIcon />
                      <span>{googleSubmitting ? 'Connecting Google...' : 'Continue with Google'}</span>
                    </button>

                    <div className="relative flex items-center py-0.5">
                      <div className="flex-grow border-t border-neutral-200" />
                      <span className="shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Or continue with email
                      </span>
                      <div className="flex-grow border-t border-neutral-200" />
                    </div>

                    <form onSubmit={handleEmailSignInSubmit} autoComplete="off" className="space-y-3.5 text-xs">
                      <div>
                        <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-neutral-700" />
                          <span>Email Address *</span>
                        </label>
                        <input
                          type="email"
                          name="hs_guest_email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-black font-semibold flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-neutral-700" />
                            <span>Password *</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleOpenForgotPassword}
                            className="text-[11px] font-bold text-black hover:text-neutral-700 underline cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="hs_guest_pass"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full bg-white border border-neutral-300 rounded-xl pl-3.5 pr-11 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-600 hover:text-black cursor-pointer"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting || googleSubmitting}
                        className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                      >
                        {submitting ? 'Signing In...' : 'Sign In'}
                      </button>
                    </form>
                  </div>
                )
              ) : (
                /* SIGN UP FLOW (Google Sign-Up + Direct Email & Password Registration) */
                <div className="space-y-4 text-xs">
                  <button
                    type="button"
                    disabled={googleSubmitting || submitting}
                    onClick={() => handleGoogleAuth('signup')}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-300 text-black font-bold text-xs flex items-center justify-center gap-2.5 shadow-xs cursor-pointer disabled:opacity-55"
                  >
                    <GoogleIcon />
                    <span>{googleSubmitting ? 'Connecting Google...' : 'Continue with Google'}</span>
                  </button>

                  <div className="relative flex items-center py-0.5">
                    <div className="flex-grow border-t border-neutral-200" />
                    <span className="shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      Or register with email
                    </span>
                    <div className="flex-grow border-t border-neutral-200" />
                  </div>

                  <form onSubmit={handleSignUpSubmit} autoComplete="off" className="space-y-3.5 text-xs">
                    <div>
                      <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-neutral-700" />
                        <span>Full Name *</span>
                      </label>
                      <input
                        type="text"
                        name="hs_guest_name"
                        autoComplete="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                      />
                    </div>

                    <div>
                      <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-neutral-700" />
                        <span>Email Address *</span>
                      </label>
                      <input
                        type="email"
                        name="hs_guest_email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                      />
                    </div>

                    <div>
                      <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-neutral-700" />
                        <span>Password *</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="hs_guest_pass"
                          autoComplete="new-password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full bg-white border border-neutral-300 rounded-xl pl-3.5 pr-11 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-600 hover:text-black cursor-pointer"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {password && (
                        <div className="mt-1.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-semibold">
                            <span className="text-neutral-600">Password strength</span>
                            <span className={passwordStrength.textClass}>{passwordStrength.label}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full duration-200 ${passwordStrength.barClass}`}
                              style={{ width: `${passwordStrength.score}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-neutral-700" />
                        <span>Confirm Password *</span>
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="hs_guest_confirm_pass"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                      />
                      {passwordsMatch && (
                        <p className="mt-1 text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Passwords match</span>
                        </p>
                      )}
                      {passwordsMismatch && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-700 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Passwords do not match</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-neutral-700" />
                        <span>WhatsApp Phone (+91) (Optional)</span>
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3.5 text-sm sm:text-xs font-bold text-neutral-700 pointer-events-none">+91</span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          value={signupPhone}
                          onChange={(e) => setSignupPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="9876543210"
                          className="w-full bg-white border border-neutral-300 rounded-xl pl-12 pr-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-black font-semibold mb-1 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-neutral-700" />
                        <span>Address (Optional)</span>
                      </label>
                      <input
                        type="text"
                        autoComplete="street-address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Area or street"
                        className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs scroll-my-4 text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                      />
                    </div>

                    <label
                      className={`p-3 rounded-xl border cursor-pointer select-none flex items-start gap-2.5 ${
                        is18Plus
                          ? 'bg-neutral-100 border-black text-black'
                          : 'bg-neutral-50 border-neutral-300 text-neutral-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={is18Plus}
                        onChange={(e) => setIs18Plus(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-black cursor-pointer shrink-0"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-black block">
                          I confirm that I am 18 years of age or older *
                        </span>
                        <span className="text-[11px] text-neutral-600 block mt-0.5">
                          Mandatory to place food orders or book PS5 &amp; 8-ball pool slots.
                        </span>
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={submitting || googleSubmitting || !is18Plus}
                      className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      {submitting ? 'Creating Account...' : 'Create Account'}
                    </button>
                  </form>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-200 flex items-center justify-center text-[11px] text-neutral-700">
                {authModalMode === 'signin' ? (
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('signup')}
                    className="text-black font-semibold hover:text-neutral-700 underline cursor-pointer"
                  >
                    New here? Create an account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('signin')}
                    className="text-black font-semibold hover:text-neutral-700 underline cursor-pointer"
                  >
                    Already registered? Sign in
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
