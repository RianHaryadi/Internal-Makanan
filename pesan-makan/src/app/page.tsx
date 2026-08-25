import Link from "next/link";
import { getAllSessions, getAllWarungs, getOrdersBySession } from "@/db/queries";
import { formatDateID, formatRupiah } from "@/lib/utils";
import {
  Plus,
  Store,
  ClipboardList,
  ArrowRight,
  Users,
  ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [allSessions, allWarungs] = await Promise.all([
    getAllSessions(),
    getAllWarungs(),
  ]);

  const activeSessions = allSessions.filter((s) => s.session.status === "open");

  const activeSessionsWithCount = await Promise.all(
    activeSessions.map(async (item) => {
      const orders = await getOrdersBySession(item.session.id);
      return {
        ...item,
        orderCount: orders.length,
      };
    })
  );

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="ui-card p-6 sm:p-8 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="max-w-md space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
            <span>Koordinasi Pesanan Tim</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Pesan makan siang bareng tanpa repot hitung tagihan.
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Kumpulkan pesanan tim, hitung ongkir otomatis, dan dapatkan rekap tagihan WhatsApp dalam satu klik.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
          <Link
            href="/sesi/baru"
            className="ui-btn-primary px-4 py-2.5 text-xs gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Buka Sesi Baru</span>
          </Link>
          <Link
            href="/warung"
            className="ui-btn-secondary px-4 py-2.5 text-xs gap-2"
          >
            <Store className="w-4 h-4" />
            <span>Daftar Warung ({allWarungs.length})</span>
          </Link>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <Link
          href="/sesi"
          className="ui-card-hover p-4 block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Sesi Aktif</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {activeSessions.length}
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Menerima pesanan</span>
        </Link>

        <Link
          href="/warung"
          className="ui-card-hover p-4 block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Warung</span>
            <Store className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {allWarungs.length}
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Tersimpan di katalog</span>
        </Link>

        <Link
          href="/sesi"
          className="col-span-2 sm:col-span-1 ui-card-hover p-4 block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Riwayat</span>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {allSessions.length}
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Sesi yang pernah dibuat</span>
        </Link>
      </div>

      {/* Active Sessions Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Sesi Sedang Berlangsung
            </h2>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {activeSessionsWithCount.length}
            </span>
          </div>
          {activeSessions.length > 0 && (
            <Link
              href="/sesi"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-0.5"
            >
              <span>Semua sesi</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {activeSessionsWithCount.length === 0 ? (
          <div className="ui-card p-8 text-center bg-white space-y-2">
            <p className="text-sm font-medium text-slate-900">
              Belum ada sesi pemesanan aktif
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Buka sesi pemesanan baru dan bagikan tautan ke tim agar mereka dapat memilih menu.
            </p>
            <div className="pt-2">
              <Link
                href="/sesi/baru"
                className="ui-btn-primary px-4 py-2 text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buka Sesi Sekarang</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeSessionsWithCount.map(({ session, warung, orderCount }) => (
              <div
                key={session.id}
                className="ui-card p-4 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Aktif
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDateID(session.tanggal)}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 truncate">
                    {warung?.nama ?? "Warung Pilihan"}
                  </h3>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{orderCount} pesanan</span>
                    </span>
                    {session.biayaTambahan > 0 && (
                      <span>• Ongkir {formatRupiah(session.biayaTambahan)}</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-2">
                  <Link
                    href={`/pesan/${session.id}`}
                    className="ui-btn-secondary flex-1 text-xs py-1.5"
                  >
                    Form Pesan
                  </Link>
                  <Link
                    href={`/sesi/${session.id}`}
                    className="ui-btn-primary flex-1 text-xs py-1.5 gap-1"
                  >
                    <span>Kelola & Rekap</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Warungs Directory Quick View */}
      {allWarungs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Daftar Warung
            </h2>
            <Link
              href="/warung"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-0.5"
            >
              <span>Kelola semua</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {allWarungs.slice(0, 4).map((w) => (
              <Link
                key={w.id}
                href={`/warung/${w.id}`}
                className="ui-card p-3.5 hover:border-slate-300 transition-colors block"
              >
                <h4 className="font-medium text-slate-900 text-sm truncate">
                  {w.nama}
                </h4>
                <p className="text-xs text-slate-400 mt-1">Kelola menu →</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
