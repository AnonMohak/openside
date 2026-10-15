import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
} from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import {
  MdLockOutline,
  MdOutlineVisibility,
  MdOutlineVisibilityOff,
} from "react-icons/md";
import { LuLoaderCircle } from "react-icons/lu";

import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/lib/toast";

export type AuthMode = "signin" | "signup";

interface AuthModalProps {
  open: boolean;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  forceLight?: boolean;
}

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-foreground/40 focus:border-foreground/30";

const AuthModal = ({
  open,
  mode,
  onModeChange,
  onClose,
  forceLight = false,
}: AuthModalProps) => {
  const {
    loginWithGoogle,
    signInWithEmail,
    startEmailSignup,
    resendEmailVerification,
    verifyEmailCode,
    sendPasswordResetCode,
    resetPassword,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Signup code-verification phase.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Forgot-password phase.
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Track content height so the card can animate when its contents change.
  const contentRef = useRef<HTMLDivElement>(null);
  // A motion value (not state) so resizing never re-renders the modal, which
  // would restart in-flight layout animations like the tab pill.
  const contentHeight = useMotionValue<number | "auto">("auto");

  useEffect(() => {
    const node = contentRef.current;
    if (!open || !node) return;
    let measured = false;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.borderBoxSize[0]?.blockSize ?? node.offsetHeight;
      if (!measured) {
        measured = true;
        contentHeight.jump(next);
        return;
      }
      animate(contentHeight, next, {
        duration: 0.25,
        ease: [0.16, 1, 0.3, 1],
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, contentHeight]);

  const resetState = () => {
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setCodeSent(false);
    setCode("");
    setForgotPassword(false);
    setResetCodeSent(false);
    setResetCode("");
    setNewPassword("");
    setResetError(null);
  };

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Reset transient state whenever the modal is dismissed.
  useEffect(() => {
    if (!open) resetState();
  }, [open]);

  const switchMode = (next: AuthMode) => {
    if (next === mode) return;
    resetState();
    onModeChange(next);
  };

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
    } catch {
      // Authentication errors are handled by the auth provider.
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    const result =
      mode === "signin"
        ? await signInWithEmail(email.trim(), password)
        : await startEmailSignup(email.trim(), password);

    // On success the hook routes to the dashboard once the profile is loaded;
    // keep the loader up until then instead of flashing the form back.
    if (result.ok && result.status === "signed_in") return;

    if (result.ok && result.status === "verify_code") {
      setCodeSent(true);
    } else if (!result.ok) {
      toast.error(result.message);
    }

    setIsSubmitting(false);
  };

  const handleVerifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isVerifying || code.trim().length < 6) return;

    setIsVerifying(true);
    const result = await verifyEmailCode(code.trim());
    if (result.ok && result.status === "signed_in") return;
    if (!result.ok) toast.error(result.message);
    setIsVerifying(false);
  };

  const handleResendCode = async () => {
    if (isResending) return;

    setIsResending(true);
    const result = await resendEmailVerification(email.trim(), password);
    if (result.ok && result.status === "verify_code") setCodeSent(true);
    setIsResending(false);
  };

  const handleSendResetCode = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (isSendingReset || !email.trim()) return;

    setIsSendingReset(true);
    setResetError(null);
    const result = await sendPasswordResetCode(email.trim());
    if (result.ok) {
      setResetCodeSent(true);
    } else {
      setResetError(result.message);
    }
    setIsSendingReset(false);
  };

  const handleResetPassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (isResettingPassword || resetCode.trim().length < 6 || !newPassword) {
      return;
    }

    setIsResettingPassword(true);
    setResetError(null);
    const result = await resetPassword(resetCode.trim(), newPassword);
    if (!result.ok) setResetError(result.message);
    setIsResettingPassword(false);
  };

  const isSignup = mode === "signup";

  const heading = forgotPassword
    ? resetCodeSent
      ? "Set a new password"
      : "Reset your password"
    : codeSent
      ? "Verify your email"
      : isSignup
        ? "Create your account"
        : "Welcome back";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
            className={`relative w-full max-w-[360px] overflow-hidden rounded-xl shadow-2xl shadow-black/20 ${
              forceLight ? "bg-[#ffffff]" : "bg-background dark:bg-black"
            }`}
          >
            <motion.div style={{ height: contentHeight }}>
              <div ref={contentRef} className="p-6">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {heading}
                </h2>

                {forgotPassword ? (
                  resetCodeSent ? (
                    <form
                      className="mt-5 flex w-full flex-col gap-3"
                      onSubmit={handleResetPassword}
                    >
                      <div>
                        <label
                          htmlFor="reset-code"
                          className="mb-1 block text-[13px] font-medium text-foreground"
                        >
                          Code
                        </label>
                        <input
                          id="reset-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="123456"
                          value={resetCode}
                          onChange={(e) =>
                            setResetCode(
                              e.target.value.replace(/\D/g, "").slice(0, 6),
                            )
                          }
                          className={`${inputClass} tracking-[0.3em] placeholder:tracking-normal`}
                          required
                          autoFocus
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="new-password"
                          className="mb-1 block text-[13px] font-medium text-foreground"
                        >
                          New password
                        </label>
                        <input
                          id="new-password"
                          type="password"
                          placeholder="Enter new password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className={inputClass}
                          required
                        />
                      </div>
                      {resetError && (
                        <p className="text-sm text-red-500">{resetError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={
                          isResettingPassword ||
                          resetCode.trim().length < 6 ||
                          !newPassword
                        }
                        className="mt-1 flex h-10 w-full items-center justify-center rounded-md bg-[#131313] px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#131313]/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isResettingPassword
                          ? "Resetting..."
                          : "Reset password"}
                      </button>
                    </form>
                  ) : (
                    <form
                      className="mt-5 flex w-full flex-col gap-3"
                      onSubmit={handleSendResetCode}
                    >
                      <div>
                        <label
                          htmlFor="forgot-email"
                          className="mb-1 block text-[13px] font-medium text-foreground"
                        >
                          Email
                        </label>
                        <input
                          id="forgot-email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputClass}
                          required
                          autoFocus
                        />
                      </div>
                      {resetError && (
                        <p className="text-sm text-red-500">{resetError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={isSendingReset || !email.trim()}
                        className="mt-1 flex h-10 w-full items-center justify-center rounded-md bg-[#131313] px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#131313]/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSendingReset ? "Sending..." : "Send code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotPassword(false);
                          setResetError(null);
                        }}
                        className="text-center text-xs font-medium text-foreground/70 underline-offset-4 hover:underline"
                      >
                        Back to sign in
                      </button>
                    </form>
                  )
                ) : codeSent ? (
                  <form
                    className="mt-5 flex w-full flex-col gap-3"
                    onSubmit={handleVerifyCode}
                  >
                    <p className="text-sm text-foreground/70">
                      Sent to{" "}
                      <span className="font-medium text-foreground">
                        {email.trim()}
                      </span>
                    </p>
                    <label className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
                      <MdLockOutline className="size-4 text-foreground" />
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="Verification code"
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        className="h-full min-w-0 flex-1 bg-transparent tracking-[0.3em] outline-none placeholder:tracking-normal placeholder:text-foreground/50"
                        required
                        autoFocus
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={isVerifying || code.trim().length < 6}
                      className="mt-1 flex h-10 w-full items-center justify-center rounded-md bg-[#131313] px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#131313]/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isVerifying ? (
                        <>
                          <LuLoaderCircle className="mr-2 size-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify & Continue"
                      )}
                    </button>
                    <div className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={isResending}
                        className="font-semibold text-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isResending ? "Sending..." : "Resend code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCodeSent(false);
                          setCode("");
                        }}
                        className="text-foreground/70 underline-offset-4 hover:underline"
                      >
                        Use a different email
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="mt-5 flex w-full rounded-lg bg-muted p-1">
                      {(["signin", "signup"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => switchMode(tab)}
                          className={`relative flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                            mode === tab
                              ? "text-foreground"
                              : "text-foreground/50 hover:text-foreground"
                          }`}
                        >
                          {mode === tab && (
                            <motion.span
                              layoutId="auth-mode-pill"
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 40,
                              }}
                              className="absolute inset-0 rounded-md bg-background shadow-sm"
                            />
                          )}
                          <span className="relative">
                            {tab === "signin" ? "Sign in" : "Sign up"}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={handleGoogle}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium transition duration-200 hover:bg-primary"
                      >
                        <FcGoogle size={18} />
                        <span>Continue with Google</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
                          Or
                        </p>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <form
                        className="flex w-full flex-col gap-3"
                        onSubmit={handleSubmit}
                      >
                        <div>
                          <label
                            htmlFor="email"
                            className="mb-1 block text-[13px] font-medium text-foreground"
                          >
                            Email
                          </label>
                          <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClass}
                            required
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="password"
                            className="mb-1 block text-[13px] font-medium text-foreground"
                          >
                            Password
                          </label>
                          <div className="relative">
                            <input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className={`${inputClass} pr-10`}
                              required
                            />
                            <button
                              type="button"
                              aria-label={
                                showPassword ? "Hide password" : "Show password"
                              }
                              onClick={() =>
                                setShowPassword((current) => !current)
                              }
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 transition-colors hover:text-foreground"
                            >
                              {showPassword ? (
                                <MdOutlineVisibilityOff className="size-4" />
                              ) : (
                                <MdOutlineVisibility className="size-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {!isSignup && (
                            <motion.div
                              key="forgot-password"
                              // Negative margin cancels the form gap while collapsed.
                              initial={{
                                height: 0,
                                opacity: 0,
                                marginTop: -12,
                              }}
                              animate={{
                                height: "auto",
                                opacity: 1,
                                marginTop: -4,
                              }}
                              exit={{ height: 0, opacity: 0, marginTop: -12 }}
                              transition={{
                                duration: 0.25,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="flex justify-end overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() => setForgotPassword(true)}
                                className="text-xs text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
                              >
                                Forgot password?
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <button
                          type="submit"
                          disabled={isSubmitting || !email.trim() || !password}
                          className="mt-1 flex h-10 w-full items-center justify-center rounded-md bg-[#131313] px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#131313]/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSubmitting ? (
                            <>
                              <LuLoaderCircle className="mr-2 size-4 animate-spin" />
                              {isSignup
                                ? "Creating account..."
                                : "Signing in..."}
                            </>
                          ) : isSignup ? (
                            "Sign up"
                          ) : (
                            "Sign in"
                          )}
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
