import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";
import AdminSidebar from "@/components/AdminSidebar";
import AdminAuthWatcher from "@/components/admin/AdminAuthWatcher";

export const metadata: Metadata = {
  title: {
    default: "Admin Portal",
    template: "%s | Admin Portal",
  },
  description: "Dealer administration portal.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      {/* Global session-expiry guard. It was imported here and never rendered,
          so every admin page sat on a dead "Authentication required" banner
          when a session expired instead of going to login. Its own tests
          passed the whole time: they exercise the component directly and never
          asserted it was mounted. layout-mounts-auth-watcher.test.tsx does. */}
      <AdminAuthWatcher />

      {/*
        Hide the root layout's public chrome (top bar, nav header, footer,
        chat bubble, cookie banner) on all admin pages. The admin layout
        provides its own chrome via AdminSidebar.
      */}
      <style>{`
        #wolfpack-top-bar,
        header[role="banner"],
        footer[role="contentinfo"],
        #wolfpack-chat,
        #wolfpack-cookie {
          display: none !important;
        }
        main#main-content {
          padding: 0 !important;
        }
      `}</style>

      {/*
        Mobile:  sidebar is a slide-over overlay → main takes full width,
                 needs pt-14 to clear the fixed mobile top bar.
        Desktop: sidebar is static in the flex row → main takes remaining
                 width naturally, no top padding needed.
      */}
      <div className="flex min-h-[100dvh] overflow-x-hidden">
        <AdminSidebar />
        <main
          id="admin-main-content"
          className="min-w-0 flex-1 overflow-x-hidden bg-surface-muted pt-14 lg:pt-0"
        >
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
