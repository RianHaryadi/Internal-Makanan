import Link from "next/link";
import { getAllWarungs, getMenuItemsByWarung } from "@/db/queries";
import { formatRupiah } from "@/lib/utils";
import { Plus, Store, Utensils, Edit3, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WarungListPage() {
  const warungs = await getAllWarungs();

  const warungsWithDetails = await Promise.all(
    warungs.map(async (w) => {
      const menus = await getMenuItemsByWarung(w.id);
      const prices = menus.map((m) => m.harga);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      return {
        ...w,
        menuCount: menus.length,
        minPrice,
        maxPrice,
      };
    })
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Daftar Warung & Resto
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            Kelola tempat makan langganan tim beserta daftar menu dan harga.
          </p>
        </div>
        <Link
          href="/warung/baru"
          className="ui-btn-primary px-3.5 py-2 text-xs gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Warung</span>
        </Link>
      </div>

      {/* List */}
      {warungsWithDetails.length === 0 ? (
        <div className="ui-card p-8 text-center bg-white space-y-2">
          <p className="text-sm font-medium text-slate-900">Belum ada warung</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Tambahkan warung atau restoran favorit kantor agar tim bisa langsung memilih menu saat membuka sesi.
          </p>
          <div className="pt-2">
            <Link
              href="/warung/baru"
              className="ui-btn-primary px-4 py-2 text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Warung Pertama</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {warungsWithDetails.map((w) => (
            <div
              key={w.id}
              className="ui-card p-4 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="font-semibold text-slate-900 text-base">
                    {w.nama}
                  </h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                    {w.menuCount} menu
                  </span>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-slate-400" />
                  {w.menuCount > 0 ? (
                    <span>
                      {formatRupiah(w.minPrice)}
                      {w.minPrice !== w.maxPrice && ` – ${formatRupiah(w.maxPrice)}`}
                    </span>
                  ) : (
                    <span className="text-amber-600 italic">Belum ada menu tersimpan</span>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-2">
                <Link
                  href={`/sesi/baru?warungId=${w.id}`}
                  className="ui-btn-primary flex-1 text-xs py-1.5 gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Buka Sesi</span>
                </Link>
                <Link
                  href={`/warung/${w.id}`}
                  className="ui-btn-secondary text-xs py-1.5 px-3 gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Kelola</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
