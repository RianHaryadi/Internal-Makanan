import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionById, getMenuItemsByWarung } from "@/db/queries";
import { formatDateID } from "@/lib/utils";
import OrderForm from "./order-form";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PesanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionRow = await getSessionById(id);
  if (!sessionRow) notFound();

  const { session, warung } = sessionRow;
  const menuItems = warung ? await getMenuItemsByWarung(warung.id) : [];

  // If closed, show closed message
  if (session.status === "closed") {
    return (
      <div className="max-w-md mx-auto pt-6 sm:pt-10">
        <div className="ui-card p-6 text-center space-y-3 bg-white">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Sesi Pemesanan Telah Ditutup
            </h1>
            <p className="text-slate-500 text-xs mt-1 leading-relaxed">
              Pemesanan untuk <strong>{warung?.nama}</strong> ({formatDateID(session.tanggal)}) telah ditutup oleh koordinator.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={`/sesi/${session.id}`}
              className="ui-btn-primary inline-flex text-xs px-4 py-2"
            >
              Lihat Detail & Rekap Tagihan
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Header Info */}
      <div className="ui-card p-5 bg-white space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Formulir Pesanan</span>
          <span>{formatDateID(session.tanggal)}</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900">
          {warung?.nama ?? "Warung Pilihan"}
        </h1>
        <p className="text-xs text-slate-500">
          Masukkan nama Anda dan pilih menu yang ingin dipesan.
        </p>
      </div>

      {/* Order Form */}
      <OrderForm
        sessionId={session.id}
        warungNama={warung?.nama ?? "Warung"}
        menuItems={menuItems}
      />
    </div>
  );
}
