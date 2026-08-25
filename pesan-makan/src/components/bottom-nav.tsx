"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, ClipboardList, Home, Plus } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  // Hide on public order form page (/pesan/*) so it never collides with the order submission cart bar
  if (pathname.startsWith("/pesan/")) {
    return null;
  }

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-4 py-2 flex items-center justify-around">
      <Link
        href="/"
        className={`flex flex-col items-center gap-1 py-1 px-3 text-[11px] font-medium transition-colors ${
          pathname === "/" ? "text-slate-900 font-semibold" : "text-slate-500 hover:text-slate-900"
        }`}
      >
        <Home className="w-4 h-4" />
        <span>Beranda</span>
      </Link>
      <Link
        href="/warung"
        className={`flex flex-col items-center gap-1 py-1 px-3 text-[11px] font-medium transition-colors ${
          pathname.startsWith("/warung") ? "text-slate-900 font-semibold" : "text-slate-500 hover:text-slate-900"
        }`}
      >
        <Store className="w-4 h-4" />
        <span>Warung</span>
      </Link>
      <Link
        href="/sesi/baru"
        className="flex flex-col items-center gap-1 py-1 px-3 text-slate-900 text-[11px] font-semibold"
      >
        <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </div>
        <span>Buka Sesi</span>
      </Link>
      <Link
        href="/sesi"
        className={`flex flex-col items-center gap-1 py-1 px-3 text-[11px] font-medium transition-colors ${
          pathname.startsWith("/sesi") && pathname !== "/sesi/baru"
            ? "text-slate-900 font-semibold"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        <ClipboardList className="w-4 h-4" />
        <span>Sesi</span>
      </Link>
    </nav>
  );
}
