"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * Wraps the application with NextAuth's SessionProvider.
 *
 * This must be a client component because SessionProvider uses React
 * context internally. Import this in layouts that need session access.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
