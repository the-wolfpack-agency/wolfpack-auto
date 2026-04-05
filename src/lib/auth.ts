import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { query } from "@/lib/db";
import { decryptPII } from "@/lib/crypto";
import { verifyTOTP, verifyBackupCode } from "@/lib/mfa";

/* -------------------------------------------------------------------------- */
/* Type augmentation for NextAuth session / JWT                               */
/* -------------------------------------------------------------------------- */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      dealer_id: string;
      role: "owner" | "admin" | "manager" | "staff";
    };
    /** True when the session JWT was created after MFA was verified. */
    mfaVerified?: boolean;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    dealer_id: string;
    role: "owner" | "admin" | "manager" | "staff";
    /** Set when MFA is required before issuing a full session. */
    mfa_required?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    dealer_id: string;
    role: "owner" | "admin" | "manager" | "staff";
    lastActivity: number;
    /**
     * When true the user authenticated with password but has NOT yet
     * completed the TOTP step. The session is in a "pending MFA" state:
     * only the MFA verify endpoint is accessible until the user passes
     * the TOTP challenge and receives a new session.
     */
    mfa_pending?: boolean;
    /** True once MFA has been verified for this session. */
    mfa_verified?: boolean;
  }
}

/* -------------------------------------------------------------------------- */
/* Login rate limiting (in-memory, per-process)                               */
/* -------------------------------------------------------------------------- */

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
}

// In-memory fallback for rate limiting (used when Redis unavailable)
const loginAttemptMap = new Map<string, LoginAttempt>();

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * Get Redis client if available. Returns null if REDIS_URL not set or connection fails.
 */
async function getRedisForRateLimit(): Promise<{ incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<void>; get: (key: string) => Promise<string | null>; del: (key: string) => Promise<void> } | null> {
  if (!process.env.REDIS_URL) return null;
  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000 });
    await redis.connect();
    return {
      incr: async (key: string) => redis.incr(key),
      expire: async (key: string, seconds: number) => { await redis.expire(key, seconds); },
      get: async (key: string) => redis.get(key),
      del: async (key: string) => { await redis.del(key); },
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a login attempt is allowed. Uses Redis if available,
 * falls back to in-memory (single-instance only).
 */
async function checkLoginRateLimit(email: string): Promise<boolean> {
  const key = `login_attempts:${email}`;

  // Try Redis first (production-safe, persists across restarts/instances)
  const redis = await getRedisForRateLimit();
  if (redis) {
    const count = await redis.get(key);
    return !count || parseInt(count, 10) < LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
  }

  // Fallback: in-memory (dev/single-instance)
  const now = Date.now();
  const entry = loginAttemptMap.get(key);
  if (!entry || now - entry.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) return true;
  return entry.count < LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
}

/** Record a failed login attempt. Redis-backed in production. */
async function recordFailedLogin(email: string): Promise<void> {
  const key = `login_attempts:${email}`;

  const redis = await getRedisForRateLimit();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 15 * 60); // 15 min TTL
    return;
  }

  // Fallback: in-memory
  const now = Date.now();
  const entry = loginAttemptMap.get(key);
  if (!entry || now - entry.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttemptMap.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

/** Reset rate limit counter on successful login. */
async function resetLoginRateLimit(email: string): Promise<void> {
  const key = `login_attempts:${email}`;
  const redis = await getRedisForRateLimit();
  if (redis) { await redis.del(key); return; }
  loginAttemptMap.delete(key);
}

/* -------------------------------------------------------------------------- */
/* Session idle timeout                                                       */
/* -------------------------------------------------------------------------- */

/** Maximum idle time before session is invalidated (30 minutes). */
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* NextAuth configuration                                                     */
/* -------------------------------------------------------------------------- */

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[AUTH] NEXTAUTH_SECRET must be set in production. " +
        "Generate one with: openssl rand -base64 32"
      );
    }
    return "wolfpack-dev-secret-do-not-use-in-production";
  })(),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours — reasonable for dealer staff
  },

  pages: {
    signIn: "/admin/login",
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        /**
         * Second-step MFA credentials. When the login page detects that
         * MFA is required (via the `mfa_required` flag on the user object),
         * it calls signIn again with just these fields after the user enters
         * their TOTP token or backup code.
         */
        mfa_user_id: { label: "MFA User ID", type: "text" },
        mfa_token: { label: "MFA Token", type: "text" },
        mfa_is_backup_code: { label: "Is Backup Code", type: "text" },
      },

      async authorize(credentials) {
        // Fail fast at request-time (not build-time) if secret is missing in prod
        if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
          throw new Error(
            "[auth] NEXTAUTH_SECRET is not set. Set it in your Vercel environment variables.",
          );
        }

        // ----------------------------------------------------------------
        // MFA second-step: verify TOTP / backup code and issue full session
        // ----------------------------------------------------------------
        if (credentials?.mfa_user_id && credentials?.mfa_token) {
          const userId = credentials.mfa_user_id.trim();
          const token = credentials.mfa_token.trim();
          const isBackupCode = credentials.mfa_is_backup_code === "true";

          const mfaRow = await query<{
            id: string;
            email: string;
            name: string;
            dealer_id: string;
            role: string;
            is_active: boolean;
            mfa_secret: string | null;
            mfa_enabled: boolean;
            mfa_backup_codes: string[] | null;
          }>(
            `SELECT id, email, name, dealer_id, role, is_active,
                    mfa_secret, mfa_enabled, mfa_backup_codes
               FROM dealer_users
              WHERE id = $1
              LIMIT 1`,
            [userId],
          );

          const mfaUser = mfaRow.rows[0];
          if (!mfaUser || !mfaUser.is_active || !mfaUser.mfa_enabled || !mfaUser.mfa_secret) {
            return null;
          }

          const plaintextSecret = decryptPII(mfaUser.mfa_secret);
          let mfaValid = false;

          if (isBackupCode) {
            mfaValid = verifyBackupCode(token, mfaUser.mfa_backup_codes ?? []);
            if (mfaValid) {
              // Consume the backup code
              const { hashBackupCode } = await import("@/lib/mfa");
              const usedHash = hashBackupCode(token);
              const remaining = (mfaUser.mfa_backup_codes ?? []).filter(
                (h) => h !== usedHash,
              );
              await query(
                `UPDATE dealer_users SET mfa_backup_codes = $1 WHERE id = $2`,
                [remaining, userId],
              );
            }
          } else {
            mfaValid = verifyTOTP(plaintextSecret, token);
          }

          if (!mfaValid) return null;

          return {
            id: mfaUser.id,
            email: mfaUser.email,
            name: mfaUser.name,
            dealer_id: mfaUser.dealer_id,
            role: mfaUser.role as "admin" | "manager" | "staff",
            // Signal to the JWT callback that MFA has been verified
            mfa_required: false,
          };
        }

        // ----------------------------------------------------------------
        // Demo credential — active ONLY when:
        //   1. DATABASE_URL is NOT set (no real database = shadow/demo mode), OR
        //   2. DEMO_MODE is explicitly set to "true"
        //
        // In production with a real database, demo credentials are DISABLED.
        // This prevents demo@wolfpackauto.com from being a backdoor in prod.
        // ----------------------------------------------------------------
        const demoAllowed = !process.env.DATABASE_URL || process.env.DEMO_MODE === "true";
        if (
          demoAllowed &&
          credentials?.email?.toLowerCase().trim() === "demo@wolfpackauto.com" &&
          credentials?.password === "demo"
        ) {
          return {
            id: "demo-user",
            email: "demo@wolfpackauto.com",
            name: "Demo Admin",
            dealer_id: "demo-dealer",
            role: "admin" as const,
            mfa_required: false,
          };
        }

        // ----------------------------------------------------------------
        // Step 1: password authentication
        // ----------------------------------------------------------------
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();

        // Rate limit check: deny if too many recent failures
        if (!(await checkLoginRateLimit(email))) {
          throw new Error(
            "Too many login attempts. Please try again in 15 minutes.",
          );
        }

        const result = await query<{
          id: string;
          email: string;
          name: string;
          password_hash: string;
          dealer_id: string;
          role: string;
          is_active: boolean;
          mfa_enabled: boolean;
        }>(
          `SELECT id, email, name, password_hash, dealer_id, role, is_active, mfa_enabled
           FROM dealer_users
           WHERE email = $1
           LIMIT 1`,
          [email],
        );

        const user = result.rows[0];

        if (!user) {
          await recordFailedLogin(email);
          return null;
        }

        // Account must be active
        if (!user.is_active) {
          await recordFailedLogin(email);
          return null;
        }

        // Verify password
        const passwordValid = await compare(
          credentials.password,
          user.password_hash,
        );

        if (!passwordValid) {
          await recordFailedLogin(email);
          return null;
        }

        // Successful password auth — reset rate limiter
        await resetLoginRateLimit(email);

        // If MFA is enabled, signal the login page to show the TOTP step.
        // We return the user with mfa_required=true; the JWT callback will
        // set mfa_pending=true so middleware can gate access.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          dealer_id: user.dealer_id,
          role: user.role as "admin" | "manager" | "staff",
          mfa_required: user.mfa_enabled,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();

      // On initial sign-in, copy user fields into the JWT
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.dealer_id = user.dealer_id;
        token.role = user.role;
        token.lastActivity = now;

        // Mark whether MFA still needs to be verified for this session.
        // mfa_required=true  → password passed, TOTP not yet checked
        // mfa_required=false → either MFA is not enabled, or TOTP passed
        if (user.mfa_required) {
          token.mfa_pending = true;
          token.mfa_verified = false;
        } else {
          token.mfa_pending = false;
          token.mfa_verified = true;
        }

        return token;
      }

      // On subsequent requests, check idle timeout
      if (
        token.lastActivity &&
        now - token.lastActivity > SESSION_IDLE_TIMEOUT_MS
      ) {
        // Session has been idle too long — invalidate by returning empty token.
        // NextAuth treats a token without required fields as unauthenticated.
        return {} as typeof token;
      }

      // Update last activity timestamp
      token.lastActivity = now;
      return token;
    },

    async session({ session, token }) {
      // If token was invalidated by idle timeout, the required fields
      // will be missing. Return a bare session so the client redirects.
      if (!token.id) {
        return session;
      }

      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        dealer_id: token.dealer_id,
        role: token.role,
      };
      session.mfaVerified = token.mfa_verified ?? true;
      return session;
    },
  },
};
