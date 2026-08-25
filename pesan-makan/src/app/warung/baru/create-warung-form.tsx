"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Camera,
  Sparkles,
  CheckCircle2,
  X,
} from "lucide-react";

interface MenuItemInput {
  namaItem: string;
  harga: string;
}

export default function CreateWarungForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nama, setNama] = useState("");
  const [menus, setMenus] = useState<MenuItemInput[]>([
    { namaItem: "", harga: "" },
    { namaItem: "", harga: "" },
    { namaItem: "", harga: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // AI Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);

  function addMenu() {
    setMenus([...menus, { namaItem: "", harga: "" }]);
  }

  function removeMenu(idx: number) {
    if (menus.length <= 1) return;
    setMenus(menus.filter((_, i) => i !== idx));
  }

  function updateMenu(idx: number, field: keyof MenuItemInput, val: string) {
    setMenus(menus.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));
  }

  // Handle Photo Scan
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (JPG/PNG/WEBP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setScanPreview(base64);
      setScanning(true);
      setError("");
      setScanSuccessMsg(null);

      try {
        const res = await fetch("/api/ai/scan-menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Gagal memproses gambar");
        }

        if (data.namaWarung && !nama.trim()) {
          setNama(data.namaWarung);
        }

        if (data.menus && data.menus.length > 0) {
          const newMenuList: MenuItemInput[] = data.menus.map(
            (m: { namaItem: string; harga: number }) => ({
              namaItem: m.namaItem,
              harga: String(m.harga),
            })
          );
          setMenus(newMenuList);
          setScanSuccessMsg(
            `Berhasil mengekstrak ${data.menus.length} menu otomatis dari foto!`
          );
        } else {
          setError(
            "Tidak dapat menemukan teks menu yang jelas di foto ini. Silakan input manual atau coba foto yang lebih jelas."
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memproses foto");
      } finally {
        setScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  function clearScanPreview() {
    setScanPreview(null);
    setScanSuccessMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim()) {
      setError("Nama warung tidak boleh kosong");
      return;
    }

    const validMenus = menus.filter((m) => m.namaItem.trim() && m.harga);
    if (validMenus.length === 0) {
      setError("Masukkan minimal 1 menu dengan nama dan harga");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/warungs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: nama.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Gagal membuat warung");
      }
      const warung = await res.json();

      for (const m of validMenus) {
        await fetch("/api/menu-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warungId: warung.id,
            namaItem: m.namaItem.trim(),
            harga: Number(m.harga),
          }),
        });
      }

      router.push("/warung");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* AI Photo Scan Banner */}
      <div className="ui-card p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 text-white text-[11px] font-medium border border-white/10">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Ekstraksi Otomatis AI</span>
            </div>
            <h3 className="text-sm font-semibold text-white">
              Punya Foto Buku Menu / Papan Warung?
            </h3>
            <p className="text-xs text-slate-300">
              Cukup upload atau jepret foto menu, AI akan langsung mengisi nama & daftar harganya.
            </p>
          </div>

          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="ui-btn-secondary w-full sm:w-auto text-xs px-3.5 py-2 gap-1.5 bg-white text-slate-900 hover:bg-slate-100 border-white/20 font-medium"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-900" />
                  <span>Membaca Menu...</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" />
                  <span>Foto / Upload Menu</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scan Status / Preview */}
        {scanning && (
          <div className="bg-white/10 rounded-lg p-3 text-xs text-slate-200 flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-300" />
            <span>AI sedang membaca teks menu dan harga dari foto, mohon tunggu beberapa detik...</span>
          </div>
        )}

        {scanSuccessMsg && (
          <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-lg p-3 text-xs text-emerald-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>{scanSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={clearScanPreview}
              className="text-emerald-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Warung Name Card */}
      <div className="ui-card p-4 sm:p-5 space-y-2">
        <label className="block text-xs font-medium text-slate-700">
          Nama Warung / Restoran <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="mis. Warung Bu Kris, Soto Betawi H. Husein"
          required
          className="ui-input w-full px-3 py-2 text-sm placeholder:text-slate-400"
        />
      </div>

      {/* Menu Items Card */}
      <div className="ui-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Daftar Menu & Harga
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Menu bisa diubah dan ditambah kapan saja.
            </p>
          </div>
          <button
            type="button"
            onClick={addMenu}
            className="ui-btn-secondary text-xs px-2.5 py-1 gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Baris</span>
          </button>
        </div>

        <div className="space-y-2">
          {menus.map((m, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 focus-within:bg-white focus-within:border-slate-300 transition-colors"
            >
              <div className="w-5 text-center text-xs font-medium text-slate-400 shrink-0 font-mono">
                {idx + 1}
              </div>
              <input
                type="text"
                value={m.namaItem}
                onChange={(e) => updateMenu(idx, "namaItem", e.target.value)}
                placeholder="Nama menu (mis. Nasi Goreng Spesial)"
                className="flex-1 bg-transparent border-0 px-2 py-1 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none"
              />
              <div className="relative w-28 sm:w-32 shrink-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
                  Rp
                </span>
                <input
                  type="number"
                  value={m.harga}
                  onChange={(e) => updateMenu(idx, "harga", e.target.value)}
                  placeholder="25000"
                  className="w-full bg-white border border-slate-200 rounded-md pl-8 pr-2 py-1 text-slate-900 text-sm font-medium text-right focus:outline-none focus:border-slate-900"
                />
              </div>
              {menus.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMenu(idx)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors shrink-0"
                  title="Hapus baris"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addMenu}
          className="ui-btn-secondary w-full py-2 text-xs text-slate-600 border-dashed gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah Baris Menu</span>
        </button>
      </div>

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
          onClick={() => router.push("/warung")}
          className="ui-btn-secondary flex-1 text-xs py-2"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="ui-btn-primary flex-1 text-xs py-2 disabled:opacity-50 gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <span>Simpan Warung</span>
          )}
        </button>
      </div>
    </form>
  );
}
