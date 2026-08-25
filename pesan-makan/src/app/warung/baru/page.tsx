import Link from "next/link";
import CreateWarungForm from "./create-warung-form";
import { ArrowLeft } from "lucide-react";

export default function CreateWarungPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link
          href="/warung"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Daftar Warung</span>
        </Link>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Tambah Warung Baru
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
          Masukkan nama tempat makan beserta daftar menu dan harga awalnya.
        </p>
      </div>

      <CreateWarungForm />
    </div>
  );
}
