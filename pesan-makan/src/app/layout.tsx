import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { UtensilsCrossed, Plus } from "lucide-react";
import BottomNav from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: "Pesan Makan — Pesanan Tim & Rekap WhatsApp",
  description: "Aplikasi internal untuk koordinasi pesanan makanan kantor dan rekap tagihan otomatis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2.5 group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center transition-transform group-hover:scale-105">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 tracking-tight">
                  PesanMakan
                </span>
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  Internal
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-medium transition-colors"
              >
                Beranda
              </Link>
              <Link
                href="/warung"
                className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-medium transition-colors"
              >
                Daftar Warung
              </Link>
              <Link
                href="/sesi"
                className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-medium transition-colors"
              >
                Sesi Pemesanan
              </Link>
              <div className="h-4 w-px bg-slate-200 mx-2" />
              <Link
                href="/sesi/baru"
                className="ui-btn-primary px-3 py-1.5 text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buka Sesi</span>
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-10">
          {children}
        </main>

        {/* Mobile Bottom Navigation (Hidden on order pages) */}
        <BottomNav />
      </body>
    </html>
  );
}
