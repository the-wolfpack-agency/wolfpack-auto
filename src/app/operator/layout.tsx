import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: {
    default: "Operator Console",
    template: "%s | Wolfpack Operator",
  },
  description: "Wolfpack operator console — internal use only.",
  robots: { index: false, follow: false },
};

/**
 * The operator layout wraps every /operator/* route with the NextAuth
 * SessionProvider but does NOT mount the chrome — login and
 * accept-invite are public pages that should not redirect-loop.
 *
 * Authenticated pages opt into the chrome by composing with
 * `<OperatorChrome>` (see src/components/operator/OperatorChrome.tsx).
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <style>{`
        #wolfpack-top-bar,
        header[role="banner"],
        footer[role="contentinfo"],
        #wolfpack-chat,
        #wolfpack-cookie { display: none !important; }
        main#main-content { padding: 0 !important; }
      `}</style>
      {children}
    </AuthProvider>
  );
}
