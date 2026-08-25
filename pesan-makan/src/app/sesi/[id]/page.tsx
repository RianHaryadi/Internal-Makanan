import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getSessionById,
  getOrdersBySession,
  getSessionRecapData,
} from "@/db/queries";
import { formatRupiah, formatDateID } from "@/lib/utils";
import SessionActions from "./session-actions";
import RecapDisplay from "./recap-display";
import SessionOrdersList from "./session-orders-list";
import {
  Users,
  Utensils,
  ArrowLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionRow = await getSessionById(id);
  if (!sessionRow) notFound();

  const { session, warung } = sessionRow;
  const allOrders = await getOrdersBySession(id);
  const orderCount = allOrders.length;

  const totalFood = allOrders.reduce(
    (sum, o) =>
      sum + o.items.reduce((s, i) => s + i.harga * i.qty, 0),
    0
  );

  const orderLink = `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/pesan/${session.id}`;

  const recapData = await getSessionRecapData(id);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/sesi"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Semua Sesi</span>
        </Link>
        <span
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 ${
            session.status === "open"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              session.status === "open"
                ? "bg-emerald-500 animate-pulse"
                : "bg-slate-400"
            }`}
          />
          {session.status === "open" ? "Sesi Aktif" : "Sesi Ditutup"}
        </span>
      </div>

      {/* Hero Header Card */}
      <div className="ui-card p-5 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <span className="text-xs text-slate-500 font-medium">
              {formatDateID(session.tanggal)}
            </span>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              {warung?.nama ?? "Warung Pilihan"}
            </h1>
          </div>

          <div className="flex sm:flex-col items-baseline sm:items-end justify-between border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
            <span className="text-xs text-slate-500 font-medium">Total Makanan</span>
            <span className="text-lg font-bold text-slate-900 font-mono">
              {formatRupiah(totalFood)}
            </span>
          </div>
        </div>
      </div>

      {/* Share / Close Actions if open */}
      {session.status === "open" && (
        <SessionActions
          sessionId={session.id}
          orderLink={orderLink}
          warungNama={warung?.nama ?? "Warung"}
        />
      )}

      {/* Orders List Component with Interactive Tabs & Search */}
      <SessionOrdersList
        sessionId={session.id}
        isOpen={session.status === "open"}
        orders={allOrders}
      />

      {/* Recap Generator & Live Payment Settings */}
      {recapData && (
        <RecapDisplay
          sessionId={session.id}
          status={session.status as "open" | "closed"}
          initialData={recapData}
        />
      )}
    </div>
  );
}
