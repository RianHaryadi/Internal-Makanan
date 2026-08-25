import { notFound } from "next/navigation";
import Link from "next/link";
import { getWarungById, getMenuItemsByWarung } from "@/db/queries";
import WarungEditForm from "./warung-edit-form";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditWarungPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const warung = await getWarungById(id);
  if (!warung) notFound();

  const menuItems = await getMenuItemsByWarung(id);

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
          Kelola {warung.nama}
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
          Perbarui nama warung, sesuaikan harga, atau tambah menu baru.
        </p>
      </div>

      <WarungEditForm warung={warung} menuItems={menuItems} />
    </div>
  );
}
