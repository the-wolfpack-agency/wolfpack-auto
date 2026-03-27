import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";
import AdminSidebar from "@/components/AdminSidebar";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin | Wolfpack Auto",
  },
  description: "Wolfpack Auto dealer administration portal.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen">
        {/* ---------------------------------------------------------------- */}
        {/* Sidebar (client component with session awareness)                */}
        {/* ---------------------------------------------------------------- */}
        <AdminSidebar />

        {/* ---------------------------------------------------------------- */}
        {/* Main content area                                                */}
        {/* ---------------------------------------------------------------- */}
        <main
          id="main-content"
          className="flex-1 bg-surface-muted lg:ml-0"
        >
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
