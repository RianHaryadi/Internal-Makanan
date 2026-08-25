"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah, detectCategory } from "@/lib/utils";
import type { Warung, MenuItem } from "@/db/schema";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Search,
  Camera,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

interface Props {
  warung: Warung;
  menuItems: MenuItem[];
}

export default function WarungEditForm({ warung, menuItems }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nama, setNama] = useState(warung.nama);
  const [savingName, setSavingName] = useState(false);
  const [savedNameSuccess, setSavedNameSuccess] = useState(false);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const [newName, setNewName] = useState("");
  const [newHarga, setNewHarga] = useState("");
  const [addingMenu, setAddingMenu] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHarga, setEditHarga] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingWarung, setDeletingWarung] = useState(false);

  // AI Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);

  async function handleFileScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (JPG/PNG/WEBP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
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

        if (data.menus && data.menus.length > 0) {
          // Bulk insert scanned items
          let addedCount = 0;
          for (const m of data.menus) {
            const addRes = await fetch("/api/menu-items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                warungId: warung.id,
                namaItem: m.namaItem,
                harga: m.harga,
              }),
            });
            if (addRes.ok) addedCount++;
          }

          setScanSuccessMsg(
            `Berhasil menambahkan ${addedCount} menu baru otomatis dari foto!`
          );
          router.refresh();
        } else {
          setError(
            "Tidak dapat menemukan teks menu yang jelas di foto ini. Silakan coba foto yang lebih jelas."
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

  async function saveName() {
    if (!nama.trim()) return;
    setSavingName(true);
    setSavedNameSuccess(false);
    setError("");
    const res = await fetch(`/api/warungs/${warung.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama: nama.trim() }),
    });
    setSavingName(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Gagal update nama warung");
    } else {
      setSavedNameSuccess(true);
      setTimeout(() => setSavedNameSuccess(false), 2000);
      router.refresh();
    }
  }

  async function addMenu(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newHarga) return;
    setAddingMenu(true);
    setError("");
    const res = await fetch("/api/menu-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warungId: warung.id,
        namaItem: newName.trim(),
        harga: Number(newHarga),
      }),
    });
    setAddingMenu(false);
    if (res.ok) {
      setNewName("");
      setNewHarga("");
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error || "Gagal tambah menu");
    }
  }

  function startEdit(m: MenuItem) {
    setEditingId(m.id);
    setEditName(m.namaItem);
    setEditHarga(String(m.harga));
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editHarga) return;
    setSavingEdit(true);
    const res = await fetch(`/api/menu-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namaItem: editName.trim(),
        harga: Number(editHarga),
      }),
    });
    setSavingEdit(false);
    if (res.ok) {
      setEditingId(null);
      router.refresh();
    }
  }

  async function deleteMenu(id: string, itemName: string) {
    if (!confirm(`Hapus menu "${itemName}"?`)) return;
    const res = await fetch(`/api/menu-items/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function deleteWarung() {
    if (!confirm(`Yakin ingin menghapus warung "${warung.nama}" beserta semua menunya? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setDeletingWarung(true);
    const res = await fetch(`/api/warungs/${warung.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/warung");
      router.refresh();
    } else {
      setDeletingWarung(false);
      setError("Gagal menghapus warung");
    }
  }

  const filteredMenuItems = menuItems.filter((m) =>
    m.namaItem.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* AI Photo Scan Card */}
      <div className="ui-card p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 text-white text-[11px] font-medium border border-white/10">
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>Scan Foto Menu (AI)</span>
          </div>
          <p className="text-xs text-slate-300">
            Punya foto buku menu baru? Scan foto untuk otomatis menambahkannya ke warung ini.
          </p>
        </div>

        <div className="shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileScan}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="ui-btn-secondary w-full sm:w-auto text-xs px-3 py-1.5 gap-1.5 bg-white text-slate-900 hover:bg-slate-100 border-white/20 font-medium"
          >
            {scanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-900" />
                <span>Membaca Foto...</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>Scan Foto Menu</span>
              </>
            )}
          </button>
        </div>
      </div>

      {scanSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{scanSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Edit warung name */}
      <div className="ui-card p-4 sm:p-5 space-y-2">
        <label className="block text-xs font-medium text-slate-700">
          Nama Warung / Restoran
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className="ui-input flex-1 px-3 py-2 text-sm font-medium"
          />
          <button
            onClick={saveName}
            disabled={savingName || nama === warung.nama}
            className="ui-btn-primary disabled:opacity-40 text-xs px-3.5 py-2 gap-1.5 shrink-0"
          >
            {savingName ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : savedNameSuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <span>Simpan</span>
            )}
          </button>
        </div>
      </div>

      {/* Menu List */}
      <div className="ui-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 text-sm">
              Daftar Menu & Harga
            </h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {menuItems.length}
            </span>
          </div>

          {menuItems.length > 3 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu..."
                className="ui-input w-full sm:w-44 pl-7 pr-2.5 py-1 text-xs"
              />
            </div>
          )}
        </div>

        {menuItems.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-500 text-xs">
            Belum ada menu di warung ini. Tambahkan di bawah atau scan foto menu.
          </div>
        ) : filteredMenuItems.length === 0 ? (
          <p className="text-slate-400 text-xs py-4 text-center">
            Tidak ada menu yang sesuai dengan kata kunci &quot;{searchQuery}&quot;
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredMenuItems.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/80 rounded-lg p-2.5 transition-colors"
              >
                {editingId === m.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="ui-input flex-1 px-2.5 py-1 text-sm"
                    />
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
                        Rp
                      </span>
                      <input
                        type="number"
                        value={editHarga}
                        onChange={(e) => setEditHarga(e.target.value)}
                        className="ui-input w-full pl-7 pr-2 py-1 text-sm text-right font-medium"
                      />
                    </div>
                    <button
                      onClick={() => saveEdit(m.id)}
                      disabled={savingEdit}
                      className="ui-btn-primary p-1.5 rounded-md"
                      title="Simpan"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="ui-btn-secondary p-1.5 rounded-md"
                      title="Batal"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        detectCategory(m.namaItem) === "minuman"
                          ? "bg-sky-50 text-sky-700 border border-sky-200/60"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}>
                        {detectCategory(m.namaItem) === "minuman" ? "Minuman" : "Makanan"}
                      </span>
                      <span className="font-medium text-slate-900 text-sm block truncate">
                        {m.namaItem}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 text-xs sm:text-sm shrink-0 font-mono">
                      {formatRupiah(m.harga)}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="Edit menu"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMenu(m.id, m.namaItem)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Hapus menu"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new menu form */}
        <form onSubmit={addMenu} className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Tambah menu baru..."
            className="ui-input flex-1 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <div className="relative w-28 sm:w-32">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
                Rp
              </span>
              <input
                type="number"
                value={newHarga}
                onChange={(e) => setNewHarga(e.target.value)}
                placeholder="Harga"
                className="ui-input w-full pl-7 pr-2.5 py-1.5 text-sm text-right font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={addingMenu || !newName.trim() || !newHarga}
              className="ui-btn-primary disabled:opacity-40 text-xs px-3.5 py-1.5 gap-1 shrink-0"
            >
              {addingMenu ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Delete Warung */}
      <div className="ui-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-red-100 bg-red-50/20">
        <div>
          <h3 className="font-medium text-red-900 text-xs sm:text-sm">
            Hapus Warung
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Menghapus warung akan menghapus semua menu yang terkait.
          </p>
        </div>
        <button
          onClick={deleteWarung}
          disabled={deletingWarung}
          className="ui-btn-danger text-xs px-3 py-1.5 gap-1.5 shrink-0"
        >
          {deletingWarung ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Warung</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
