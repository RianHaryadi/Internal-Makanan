"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Warung } from "@/db/schema";
import { Loader2, AlertCircle, Plus } from "lucide-react";

export default function CreateSessionForm({ warungs }: { warungs: Warung[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialWarungId = searchParams.get("warungId") || "";

  const [warungId, setWarungId] = useState(initialWarungId);
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialWarungId && warungs.some((w) => w.id === initialWarungId)) {
      setWarungId(initialWarungId);
    }
  }, [initialWarungId, warungs]);

  function setDateToday() {
    setTanggal(new Date().toISOString().slice(0, 10));
  }

  function setDateTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setTanggal(tomorrow.toISOString().slice(0, 10));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!warungId) {
      setError("Pilih warung tujuan pemesanan");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warungId,
          tanggal,
          biayaTambahan: 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Gagal membuat sesi pemesanan");
      }
      const session = await res.json();
      router.push(`/sesi/${session.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1. Pilih Warung */}
      <div className="ui-card p-4 sm:p-5 space-y-2">
        <label className="block text-xs font-medium text-slate-700">
          Pilih Warung Tujuan <span className="text-red-500">*</span>
        </label>

        {warungs.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Belum ada warung tersimpan</p>
              <p className="mt-0.5 text-amber-700">
                Tambahkan warung beserta menunya terlebih dahulu sebelum membuka sesi.
              </p>
              <a
                href="/warung/baru"
                className="ui-btn-secondary inline-flex mt-2 text-xs px-2.5 py-1"
              >
                + Tambah Warung
              </a>
            </div>
          </div>
        ) : (
          <select
            value={warungId}
            onChange={(e) => setWarungId(e.target.value)}
            required
            className="ui-input w-full px-3 py-2 text-sm font-medium cursor-pointer"
          >
            <option value="">— Pilih warung atau resto —</option>
            {warungs.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 2. Tanggal */}
      <div className="ui-card p-4 sm:p-5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-700">
            Tanggal Pesanan
          </label>
          <div className="flex gap-1.5 text-xs">
            <button
              type="button"
              onClick={setDateToday}
              className="ui-btn-secondary px-2.5 py-1 text-xs"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={setDateTomorrow}
              className="ui-btn-secondary px-2.5 py-1 text-xs"
            >
              Besok
            </button>
          </div>
        </div>

        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="ui-input w-full px-3 py-2 text-sm font-medium"
        />
      </div>

      {/* Note about payment info */}
      <p className="text-xs text-slate-500 px-1">
        Info rekening pembayaran dan ongkir dapat diatur di halaman rekap setelah semua pesanan masuk.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => router.push("/sesi")}
          className="ui-btn-secondary flex-1 text-xs py-2"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={submitting || warungs.length === 0}
          className="ui-btn-primary flex-1 text-xs py-2 disabled:opacity-50 gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Membuka Sesi...</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Buka Sesi Sekarang</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
