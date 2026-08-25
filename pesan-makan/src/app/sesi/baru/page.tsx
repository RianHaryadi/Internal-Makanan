import Link from "next/link";
import { getAllWarungs } from "@/db/queries";
import CreateSessionForm from "./create-session-form";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreateSessionPage() {
  const warungs = await getAllWarungs();

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link
          href="/sesi"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Daftar Sesi</span>
        </Link>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Buka Sesi Pemesanan Baru
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
          Pilih warung tujuan dan tentukan tanggal pemesanan bersama tim.
        </p>
      </div>

      <CreateSessionForm warungs={warungs} />
    </div>
  );
}
