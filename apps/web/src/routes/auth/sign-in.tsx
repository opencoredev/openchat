/**
 * Sign In Page - GitHub OAuth authentication
 */

import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  signInWithEmail,
  signInWithGitHub,
  signInWithVercel,
  signUpWithEmail,
  useAuth,
} from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GithubIcon,
  Logo,
  MessageSquareIcon,
  SparklesIcon,
  StarIcon,
  UsersIcon,
  VercelIcon,
} from "@/components/auth/sign-in-icons";
import { env } from "@/lib/env";
import { analytics } from "@/lib/analytics";

// Stats type from our backend
type PublicStats = {
  messages: number;
  users: number;
  chats: number;
  stars: number;
  models: number;
};

type AuthClientError = {
  code?: string;
  message?: string;
  status?: number;
};

function toAuthClientError(error: unknown): AuthClientError {
  if (!error || typeof error !== "object") return {};

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : undefined;
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;

  return { code, message, status };
}

function getSignUpErrorMessage(error: unknown): string {
  const details = toAuthClientError(error);
  const lowerMessage = details.message?.toLowerCase() ?? "";

  if (
    details.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
    details.status === 422 ||
    lowerMessage.includes("already")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }

  if (
    details.code === "EMAIL_NOT_VERIFIED" ||
    details.status === 403 ||
    lowerMessage.includes("verify")
  ) {
    return "Account created. Please verify your email before signing in.";
  }

  if (lowerMessage.includes("password")) {
    return "Password must be between 8 and 128 characters.";
  }

  if (lowerMessage.includes("rate") || lowerMessage.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return "Could not create account. Please try again.";
}

function getSignInErrorMessage(error: unknown): string {
  const details = toAuthClientError(error);
  const lowerMessage = details.message?.toLowerCase() ?? "";

  if (
    details.code === "EMAIL_NOT_VERIFIED" ||
    details.status === 403 ||
    lowerMessage.includes("verify")
  ) {
    return "Please verify your email before signing in.";
  }

  if (
    details.code === "CREDENTIAL_ACCOUNT_NOT_FOUND" ||
    lowerMessage.includes("credential account not found")
  ) {
    return "This email is linked to social sign-in. Use GitHub/Vercel or reset your password.";
  }

  if (lowerMessage.includes("rate") || lowerMessage.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return "Invalid email or password.";
}

export const Route = createFileRoute("/auth/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign in to osschat - Free AI Chat with 350+ Models" },
      { name: "description", content: "Sign in to osschat to access GPT-4, Claude, Gemini and 350+ AI models. Free tier available with no API key required." },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Sign in to osschat" },
      { property: "og:description", content: "Sign in to access 350+ AI models including GPT-4, Claude, and Gemini. Free tier available." },
      { property: "og:url", content: "https://osschat.dev/auth/sign-in" },
    ],
    links: [
      { rel: "canonical", href: "https://osschat.dev/auth/sign-in" },
    ],
  }),
  component: SignInPage,
});

// Format large numbers nicely
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// Cache stats in memory to avoid repeated fetches
let cachedStats: PublicStats | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function SignInPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, refetchSession } = useAuth();
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isVercelLoading, setIsVercelLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(cachedStats);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [loading, isAuthenticated, navigate]);

  // Fetch real stats from backend (cached)
  useEffect(() => {
    // Use cache if fresh
    if (cachedStats && Date.now() - cacheTimestamp < CACHE_TTL) {
      setStats(cachedStats);
      return;
    }

    const siteUrl = env.CONVEX_SITE_URL;
    if (!siteUrl) return;

    fetch(`${siteUrl}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          cachedStats = data;
          cacheTimestamp = Date.now();
          setStats(data);
        }
      })
      .catch(() => null);
  }, []);

  // Fallback stats while loading
  const displayStats = stats || {
    messages: 0,
    users: 0,
    models: 200,
    stars: 0,
  };

  const handleGitHubSignIn = async () => {
    setIsGitHubLoading(true);
    try {
      await signInWithGitHub("/");
    } catch (error) {
      console.error("Sign in failed:", error);
      setIsGitHubLoading(false);
    }
  };

  const handleVercelSignIn = async () => {
    setIsVercelLoading(true);
    try {
      await signInWithVercel("/");
    } catch (error) {
      console.error("Sign in failed:", error);
      setIsVercelLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setIsEmailLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password, name || email.split("@")[0] || "User");
        if (error) {
          setEmailError(getSignUpErrorMessage(error));
          return;
        }
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          setEmailError(getSignInErrorMessage(error));
          return;
        }
      }
      const success = await refetchSession();
      if (success) {
        analytics.signedIn();
        navigate({ to: "/" });
      } else {
        setEmailError("Signed in but failed to load session. Please refresh the page.");
      }
    } catch (err) {
      console.error("Email auth failed:", err);
      setEmailError(isSignUp ? "Sign up failed. Please try again." : "Sign in failed. Please try again.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const anyLoading = isGitHubLoading || isVercelLoading || isEmailLoading;

  return (
    <div className="grid min-h-svh lg:grid-cols-2 overflow-hidden">
      {/* Left Column - Sign In Form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link
            to="/"
            className="flex items-center gap-2 font-medium transition-opacity hover:opacity-80"
          >
            <Logo size="small" />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs space-y-6">
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Welcome to osschat</h1>
              <p className="text-muted-foreground text-sm">Sign in to access your workspace</p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {isSignUp && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={anyLoading}
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={anyLoading}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={anyLoading}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
              </div>

              {!isSignUp && (
                <div className="text-right">
                  <Link
                    to="/auth/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}

              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}

              <Button
                type="submit"
                disabled={anyLoading}
                className="w-full"
              >
                {isEmailLoading
                  ? (isSignUp ? "Creating account..." : "Signing in...")
                  : (isSignUp ? "Create account" : "Sign in")}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setEmailError(null); }}
              className="text-sm text-muted-foreground hover:text-foreground text-center w-full transition-colors"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleGitHubSignIn}
                disabled={anyLoading}
                variant="outline"
                className="w-full gap-2"
              >
                <GithubIcon className="size-5" />
                {isGitHubLoading ? "Signing in..." : "Continue with GitHub"}
              </Button>
              <Button
                onClick={handleVercelSignIn}
                disabled={anyLoading}
                variant="outline"
                className="w-full gap-2"
              >
                <VercelIcon className="size-4" />
                {isVercelLoading ? "Signing in..." : "Continue with Vercel"}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>

      {/* Right Column - Gradient Background with Stats */}
      <div className="relative hidden lg:block overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-background" />

        {/* Decorative Elements */}
        <div className="absolute inset-0">
          {/* Large Gradient Orbs */}
          <div className="absolute -right-1/4 -top-1/4 size-[600px] rounded-full bg-gradient-to-br from-primary/30 to-transparent blur-3xl" />
          <div className="absolute -bottom-1/4 -left-1/4 size-[500px] rounded-full bg-gradient-to-tr from-primary/20 to-transparent blur-3xl" />

          {/* Grid Pattern Overlay */}
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>

        {/* Content Overlay */}
        <div className="relative flex h-full flex-col items-center justify-center p-12">
          <div className="max-w-md text-center space-y-10">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Messages Stat */}
              <div className="rounded-2xl bg-primary/5 backdrop-blur-sm p-6 space-y-1">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <MessageSquareIcon className="size-5" />
                </div>
                <div className="text-3xl font-bold tabular-nums">
                  {displayStats.messages ? formatNumber(displayStats.messages) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">messages sent</div>
              </div>

              {/* Models Stat */}
              <div className="rounded-2xl bg-primary/5 backdrop-blur-sm p-6 space-y-1">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <SparklesIcon className="size-5" />
                </div>
                <div className="text-3xl font-bold tabular-nums">{displayStats.models}+</div>
                <div className="text-xs text-muted-foreground">AI models</div>
              </div>

              {/* Users Stat */}
              <div className="rounded-2xl bg-primary/5 backdrop-blur-sm p-6 space-y-1">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <UsersIcon className="size-5" />
                </div>
                <div className="text-3xl font-bold tabular-nums">
                  {displayStats.users ? formatNumber(displayStats.users) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">users</div>
              </div>

              {/* GitHub Stars */}
              <div className="rounded-2xl bg-primary/5 backdrop-blur-sm p-6 space-y-1">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <StarIcon className="size-5" />
                </div>
                <div className="text-3xl font-bold tabular-nums">
                  {displayStats.stars ? formatNumber(displayStats.stars) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">GitHub stars</div>
              </div>
            </div>

            {/* Tagline */}
            <div className="space-y-3">
              <p className="text-lg font-medium">One interface. Every AI model.</p>
              <p className="text-sm text-muted-foreground">
                GPT-4, Claude, Gemini, and 200+ more. Your keys, your privacy.
              </p>
            </div>

            {/* Provider Logos */}
            <div className="flex items-center justify-center gap-5 opacity-50">
              <img
                src="https://models.dev/logos/openai.svg"
                alt="OpenAI"
                width={80}
                height={16}
                loading="lazy"
                decoding="async"
                className="h-4 w-auto dark:invert"
              />
              <img
                src="https://models.dev/logos/anthropic.svg"
                alt="Anthropic"
                width={80}
                height={16}
                loading="lazy"
                decoding="async"
                className="h-4 w-auto dark:invert"
              />
              <img
                src="https://models.dev/logos/google.svg"
                alt="Google"
                width={80}
                height={16}
                loading="lazy"
                decoding="async"
                className="h-4 w-auto dark:invert"
              />
              <img
                src="https://models.dev/logos/xai.svg"
                alt="xAI"
                width={80}
                height={16}
                loading="lazy"
                decoding="async"
                className="h-4 w-auto dark:invert"
              />
              <img
                src="https://models.dev/logos/deepseek.svg"
                alt="DeepSeek"
                width={80}
                height={16}
                loading="lazy"
                decoding="async"
                className="h-4 w-auto dark:invert"
              />
            </div>

            {/* Open Source Badge */}
            <a
              href="https://github.com/opentech1/openchat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm transition-colors hover:bg-primary/20"
            >
              <GithubIcon className="size-4" />
              <span>100% Open Source</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
