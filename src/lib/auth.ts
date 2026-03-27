import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { query } from "@/lib/db";

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
      role: "admin" | "manager" | "staff";
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    dealer_id: string;
    role: "admin" | "manager" | "staff";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    dealer_id: string;
    role: "admin" | "manager" | "staff";
    lastActivity: number;
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
  secret: process.env.NEXTAUTH_SECRET || "wolfpack-dev-secret-change-in-production",

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
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();

        // Rate limit check: deny if too many recent failures
        if (!checkLoginRateLimit(email)) {
          // Returning null denies login. NextAuth shows the error page.
          // The user sees the generic "sign-in failed" message. A more
          // specific message could be returned via CredentialsSignin error
          // but null is safest to avoid leaking timing information.
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
        }>(
          `SELECT id, email, name, password_hash, dealer_id, role, is_active
           FROM dealer_users
           WHERE email = $1
           LIMIT 1`,
          [email],
        );

        const user = result.rows[0];

        if (!user) {
          recordFailedLogin(email);
          return null;
        }

        // Account must be active
        if (!user.is_active) {
          recordFailedLogin(email);
          return null;
        }

        // Verify password
        const passwordValid = await compare(
          credentials.password,
          user.password_hash,
        );

        if (!passwordValid) {
          recordFailedLogin(email);
          return null;
        }

        // Successful login — reset rate limiter
        resetLoginRateLimit(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          dealer_id: user.dealer_id,
          role: user.role as "admin" | "manager" | "staff",
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
      return session;
    },
  },
};
