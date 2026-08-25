"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/db/schema";
import { CreditCard, Edit3, Loader2, AlertCircle, Check, X, User, Building, Banknote } from "lucide-react";

export default function BillingInfoForm({ session }: { session: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(!session.namaPenagih);
  const [namaPenagih, setNamaPenagih] = useState(session.namaPenagih ?? "");
  const [namaBank, setNamaBank] = useState(session.namaBank ?? "");
  const [noRekening, setNoRekening] = useState(session.noRekening ?? "");
  const [biayaTambahan, setBiayaTambahan] = useState(String(session.biayaTambahan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namaPenagih: namaPenagih.trim() || null,
        namaBank: namaBank.trim() || null,
        noRekening: noRekening.trim() || null,
        biayaTambahan: Number(biayaTambahan) || 0,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error || "Gagal menyimpan info pembayaran");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/80 px-3 py-1.5 rounded-xl transition-all"
      >
        <Edit3 className="w-3.5 h-3.5" />
        <span>Ubah Info Rekening & Biaya Tambahan</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={save}
      className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs space-y-4 animate-scale-in"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
          <CreditCard className="w-4 h-4 text-orange-500" />
          <span>Pengaturan Rekening & Ongkir</span>
        </h3>
        {session.namaPenagih && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-600 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-stone-600">
            Nama Penagih / Pemilik
          </label>
          <div className="relative">
            <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={namaPenagih}
              onChange={(e) => setNamaPenagih(e.target.value)}
              placeholder="mis. Rian"
              className="w-full bg-stone-50/50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-900 focus:bg-white focus:border-orange-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-stone-600">
            Bank / e-Wallet
          </label>
          <div className="relative">
            <Building className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={namaBank}
              onChange={(e) => setNamaBank(e.target.value)}
              placeholder="mis. BCA"
              className="w-full bg-stone-50/50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-900 focus:bg-white focus:border-orange-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-stone-600">
            Nomor Rekening
          </label>
          <input
            type="text"
            value={noRekening}
            onChange={(e) => setNoRekening(e.target.value)}
            placeholder="mis. 5420123456"
            className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:bg-white focus:border-orange-500 outline-none font-mono transition-all"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-stone-600">
            Biaya Tambahan (Ongkir/Parkir)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-medium">
              Rp
            </span>
            <input
              type="number"
              value={biayaTambahan}
              onChange={(e) => setBiayaTambahan(e.target.value)}
              placeholder="0"
              className="w-full bg-stone-50/50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-900 focus:bg-white focus:border-orange-500 outline-none font-medium transition-all"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {session.namaPenagih && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
          >
            Batal
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-semibold py-2 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Simpan Info Pembayaran</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
