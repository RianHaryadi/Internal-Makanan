import Link from "next/link";
import { getAllSessions, getOrdersBySession } from "@/db/queries";
import { formatDateID, formatRupiah } from "@/lib/utils";
import {
  Plus,
  Users,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SesiListPage() {
  const allSessions = await getAllSessions();

  const sessionsWithDetails = await Promise.all(
    allSessions.map(async ({ session, warung }) => {
      const orders = await getOrdersBySession(session.id);
      const totalAmount =
        orders.reduce(
          (sum, o) =>
            sum + o.items.reduce((s, it) => s + it.harga * it.qty, 0),
          0
        ) + (session.biayaTambahan || 0);

      return {
        session,
        warung,
        orderCount: orders.length,
        totalAmount,
      };
    })
  );

  const activeSessions = sessionsWithDetails.filter(
    (s) => s.session.status === "open"
  );
  const closedSessions = sessionsWithDetails.filter(
    (s) => s.session.status === "closed"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Sesi Pemesanan
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            Daftar seluruh sesi pemesanan aktif dan riwayat pesanan tim.
          </p>
        </div>
        <Link
          href="/sesi/baru"
          className="ui-btn-primary px-3.5 py-2 text-xs gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Buka Sesi Baru</span>
        </Link>
      </div>

      {sessionsWithDetails.length === 0 ? (
        <div className="ui-card p-8 text-center bg-white space-y-2">
          <p className="text-sm font-medium text-slate-900">Belum ada sesi pemesanan</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Mulai sesi makan siang pertama hari ini dan bagikan link-nya ke teman-teman kantor.
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
        <div className="space-y-6">
          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Sesi Aktif ({activeSessions.length})
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {activeSessions.map(({ session, warung, orderCount, totalAmount }) => (
                  <div
                    key={session.id}
                    className="ui-card p-4 flex flex-col justify-between hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Menerima Pesanan
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDateID(session.tanggal)}
                        </span>
                      </div>

                      <h3 className="font-semibold text-slate-900 text-base line-clamp-1">
                        {warung?.nama ?? "Warung Pilihan"}
                      </h3>

                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{orderCount} peserta</span>
                        </span>
                        <span>• Total: {formatRupiah(totalAmount)}</span>
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
            </div>
          )}

          {/* Closed Sessions */}
          {closedSessions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Riwayat Selesai ({closedSessions.length})
              </h2>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {closedSessions.map(({ session, warung, orderCount, totalAmount }) => (
                  <Link
                    key={session.id}
                    href={`/sesi/${session.id}`}
                    className="ui-card p-3.5 hover:border-slate-300 transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Selesai
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDateID(session.tanggal)}
                        </span>
                      </div>
                      <h4 className="font-medium text-slate-900 text-sm truncate">
                        {warung?.nama ?? "Warung Pilihan"}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {orderCount} peserta • {formatRupiah(totalAmount)}
                      </p>
                    </div>
                    <div className="w-7 h-7 rounded-md bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-600 flex items-center justify-center shrink-0 ml-3 transition-colors">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
