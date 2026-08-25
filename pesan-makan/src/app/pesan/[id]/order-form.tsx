"use client";

import { useState, useEffect } from "react";
import { formatRupiah, detectCategory } from "@/lib/utils";
import type { MenuItem } from "@/db/schema";
import {
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Receipt,
  RotateCcw,
  ShoppingBag,
  UtensilsCrossed,
  CupSoda,
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  StickyNote,
} from "lucide-react";

interface SelectedItem {
  menuItemId: string;
  namaItem: string;
  harga: number;
  qty: number;
  kategori?: "makanan" | "minuman";
  catatan?: string;
}

export default function OrderForm({
  sessionId,
  warungNama,
  menuItems,
}: {
  sessionId: string;
  warungNama?: string;
  menuItems: MenuItem[];
}) {
  const [nama, setNama] = useState("");
  const [catatanUmum, setCatatanUmum] = useState("");
  const [showCatatanInput, setShowCatatanInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"semua" | "makanan" | "minuman">("semua");
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successName, setSuccessName] = useState("");
  const [successItems, setSuccessItems] = useState<SelectedItem[]>([]);
  const [successNote, setSuccessNote] = useState("");
  const [isCartExpanded, setIsCartExpanded] = useState(false);

  // Auto-load remembered username from localStorage
  useEffect(() => {
    try {
      const savedName = localStorage.getItem("pesan_makan_username");
      if (savedName) setNama(savedName);
    } catch {}
  }, []);

  function toggleItem(m: MenuItem) {
    const next = new Map(selected);
    if (next.has(m.id)) {
      next.delete(m.id);
    } else {
      next.set(m.id, {
        menuItemId: m.id,
        namaItem: m.namaItem,
        harga: m.harga,
        qty: 1,
        kategori: detectCategory(m.namaItem),
        catatan: "",
      });
    }
    setSelected(next);
  }

  function setItemNote(id: string, catatan: string) {
    const next = new Map(selected);
    const existing = next.get(id);
    if (existing) {
      next.set(id, { ...existing, catatan });
      setSelected(next);
    }
  }

  function setQty(id: string, qty: number, m?: MenuItem) {
    const next = new Map(selected);
    if (qty <= 0) {
      next.delete(id);
    } else {
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, qty });
      } else if (m) {
        next.set(id, {
          menuItemId: m.id,
          namaItem: m.namaItem,
          harga: m.harga,
          qty,
          kategori: detectCategory(m.namaItem),
          catatan: "",
        });
      }
    }
    setSelected(next);
  }

  const items = Array.from(selected.values());
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.harga * i.qty, 0);

  // Split menu into Makanan and Minuman
  const categorizedMenus = menuItems.map((m) => ({
    ...m,
    kategori: detectCategory(m.namaItem),
  }));

  const makananList = categorizedMenus.filter((m) => m.kategori === "makanan");
  const minumanList = categorizedMenus.filter((m) => m.kategori === "minuman");

  // Selected counts per category
  const selectedMakananCount = items.filter((i) => i.kategori === "makanan").reduce((s, i) => s + i.qty, 0);
  const selectedMinumanCount = items.filter((i) => i.kategori === "minuman").reduce((s, i) => s + i.qty, 0);

  const filteredItems = categorizedMenus.filter((m) => {
    const matchesSearch = m.namaItem.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === "semua" || m.kategori === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredMakanan = filteredItems.filter((m) => m.kategori === "makanan");
  const filteredMinuman = filteredItems.filter((m) => m.kategori === "minuman");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim()) {
      setError("Silakan isi nama kamu terlebih dahulu");
      return;
    }
    if (items.length === 0) {
      setError("Pilih minimal 1 menu makanan atau minuman");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      // Save name for convenience on next order
      try {
        localStorage.setItem("pesan_makan_username", nama.trim());
      } catch {}

      // Compile notes from individual items
      const notesList = items
        .filter((i) => i.catatan && i.catatan.trim())
        .map((i) => `${i.namaItem} (${i.catatan!.trim()})`);

      const compiledNotes = notesList.join(", ");

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          namaPemesan: nama.trim(),
          catatan: compiledNotes || null,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            qty: i.qty,
          })),
        }),
      });

      if (res.status === 409) {
        setError(`Nama "${nama.trim()}" sudah memesan di sesi ini! Gunakan nama pembeda (misal: "${nama.trim()} 2").`);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Gagal mengirim pesanan");
      }

      setSuccessItems([...items]);
      setSuccessName(nama.trim());
      setSuccessNote(compiledNotes);
      setSuccess(true);
      setIsCartExpanded(false);
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi");
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSelected(new Map());
    setSuccess(false);
    setSuccessName("");
    setSuccessItems([]);
    setSuccessNote("");
    setError("");
  }

  if (success) {
    const successTotal = successItems.reduce((s, i) => s + i.harga * i.qty, 0);
    return (
      <div className="ui-card p-6 sm:p-8 text-center space-y-4 bg-white">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
          <CheckCircle2 className="w-6 h-6" />
        </div>

        <div>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Pesanan Berhasil Dicatat
          </span>
          <h2 className="font-bold text-slate-900 text-lg mt-2">
            Terima kasih, {successName}!
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Pesananmu sudah masuk ke rekap untuk {warungNama || "warung ini"}.
          </p>
        </div>

        {/* Receipt card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-left space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 border-b border-slate-200 pb-1.5">
            <span>Ringkasan Pesanan</span>
            <Receipt className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="space-y-1.5">
            {successItems.map((i, j) => (
              <div key={j} className="text-xs text-slate-700 space-y-0.5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-medium">
                      {i.kategori === "minuman" ? "Minum" : "Makan"}
                    </span>
                    <span className="font-medium text-slate-900">
                      {i.namaItem} <span>(x{i.qty})</span>
                    </span>
                  </div>
                  <span className="font-mono font-medium">
                    {formatRupiah(i.harga * i.qty)}
                  </span>
                </div>
                {i.catatan && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/50">
                    ↳ Note: {i.catatan}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-200 flex justify-between text-xs font-semibold text-slate-900">
            <span>Total:</span>
            <span className="font-mono text-sm">
              {formatRupiah(successTotal)}
            </span>
          </div>
        </div>

        <button
          onClick={resetForm}
          className="ui-btn-secondary w-full text-xs py-2 gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Pesan Lagi (untuk teman kantor)</span>
        </button>
      </div>
    );
  }

  const renderMenuItem = (m: MenuItem & { kategori: "makanan" | "minuman" }) => {
    const sel = selected.get(m.id);
    const isSel = !!sel;
    const currentQty = sel ? sel.qty : 0;
    const itemNote = sel ? sel.catatan || "" : "";

    return (
      <div
        key={m.id}
        className={`border rounded-lg p-3 transition-all ${
          isSel
            ? "bg-slate-50/90 border-slate-900 shadow-2xs"
            : "bg-white hover:bg-slate-50/70 border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex-1 min-w-0 cursor-pointer select-none"
            onClick={() => {
              if (!isSel) toggleItem(m);
            }}
          >
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-slate-900 text-sm truncate">
                {m.namaItem}
              </h4>
            </div>
            <span className="text-xs font-semibold text-slate-600 font-mono mt-0.5 block">
              {formatRupiah(m.harga)}
            </span>
          </div>

          {/* Quantity Stepper */}
          {isSel ? (
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-md p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setQty(m.id, currentQty - 1)}
                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center justify-center transition-colors"
                title="Kurangi"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center font-semibold text-xs text-slate-900 font-mono">
                {currentQty}
              </span>
              <button
                type="button"
                onClick={() => setQty(m.id, currentQty + 1)}
                className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs flex items-center justify-center transition-colors"
                title="Tambah"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => toggleItem(m)}
              className="ui-btn-secondary text-xs px-2.5 py-1 gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400" />
              <span>Pilih</span>
            </button>
          )}
        </div>

        {/* Note input directly under this specific selected item */}
        {isSel && (
          <div className="mt-2.5 pt-2 border-t border-slate-200/80 space-y-1 animate-fade-in">
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <StickyNote className="w-3 h-3 text-slate-400" />
              <span>Catatan untuk menu ini (opsional):</span>
            </div>
            <input
              type="text"
              value={itemNote}
              onChange={(e) => setItemNote(m.id, e.target.value)}
              placeholder={
                m.kategori === "minuman"
                  ? "mis. Es sedikit, manis, es dipisah..."
                  : "mis. Sambal dipisah, gak pedes, nasi setengah..."
              }
              className="ui-input w-full px-2.5 py-1.5 text-xs placeholder:text-slate-400 bg-white"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-20">
      {/* 1. Nama Input */}
      <div className="ui-card p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-700">
            Nama Pemesan <span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] text-slate-400">Otomatis tersimpan</span>
        </div>
        <input
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="mis. Rian atau Andi"
          required
          className="ui-input w-full px-3 py-2 text-sm placeholder:text-slate-400 font-medium"
        />
      </div>

      {/* 2. Menu Selector with Category Tabs */}
      <div className="ui-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <label className="block text-xs font-medium text-slate-700">
            Pilih Menu <span className="text-red-500">*</span>
          </label>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari menu..."
              className="ui-input w-full sm:w-44 pl-7 pr-7 py-1 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs with Selected Counts */}
        {menuItems.length > 0 && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveCategory("semua")}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-colors ${
                activeCategory === "semua"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua ({menuItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("makanan")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium transition-colors ${
                activeCategory === "makanan"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UtensilsCrossed className="w-3 h-3 text-slate-500" />
              <span>Makanan ({makananList.length})</span>
              {selectedMakananCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center font-mono">
                  {selectedMakananCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("minuman")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium transition-colors ${
                activeCategory === "minuman"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CupSoda className="w-3 h-3 text-slate-500" />
              <span>Minuman ({minumanList.length})</span>
              {selectedMinumanCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center font-mono">
                  {selectedMinumanCount}
                </span>
              )}
            </button>
          </div>
        )}

        {menuItems.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-500 text-xs">
            Belum ada menu yang tersedia di warung ini.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4 text-center text-slate-500 text-xs space-y-1">
            <p>Menu tidak ditemukan untuk &quot;{searchQuery}&quot;</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("semua");
              }}
              className="text-xs text-slate-900 font-medium underline"
            >
              Lihat semua menu
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Section 1: Makanan */}
            {filteredMakanan.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-slate-500" />
                    <span>Makanan</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      ({filteredMakanan.length})
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {filteredMakanan.map(renderMenuItem)}
                </div>
              </div>
            )}

            {/* Section 2: Minuman */}
            {filteredMinuman.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <CupSoda className="w-3.5 h-3.5 text-slate-500" />
                    <span>Minuman</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      ({filteredMinuman.length})
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {filteredMinuman.map(renderMenuItem)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Floating Bottom Cart & Drawer */}
      <div className="fixed bottom-4 left-0 right-0 max-w-md mx-auto px-4 z-30 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900 text-white rounded-xl shadow-xl border border-slate-800 overflow-hidden transition-all">
          {/* Expanded Cart Details Drawer */}
          {isCartExpanded && items.length > 0 && (
            <div className="p-3.5 border-b border-slate-800 space-y-2 max-h-56 overflow-y-auto bg-slate-950/80">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800">
                <span>Rincian Pesanan Dipilih ({totalQty})</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Map())}
                  className="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Kosongkan</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {items.map((i) => (
                  <div key={i.menuItemId} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-white truncate block">{i.namaItem}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{formatRupiah(i.harga)}</span>
                      {i.catatan && (
                        <span className="text-[10px] text-amber-300 block truncate">
                          ↳ Note: {i.catatan}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQty(i.menuItemId, i.qty - 1)}
                        className="w-5 h-5 rounded hover:bg-slate-700 text-white text-xs flex items-center justify-center"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="w-5 text-center font-semibold text-xs text-white font-mono">{i.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(i.menuItemId, i.qty + 1)}
                        className="w-5 h-5 rounded hover:bg-slate-700 text-white text-xs flex items-center justify-center"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Bottom Bar */}
          <div className="p-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => items.length > 0 && setIsCartExpanded(!isCartExpanded)}
              className="min-w-0 pl-1 text-left flex items-center gap-2 group cursor-pointer"
            >
              <div>
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <span>{totalQty > 0 ? `${totalQty} menu dipilih` : "Pilih menu di atas"}</span>
                  {totalQty > 0 && (
                    isCartExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                  )}
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {formatRupiah(total)}
                </div>
              </div>
            </button>

            <button
              type="submit"
              disabled={submitting || !nama.trim() || items.length === 0}
              className="ui-btn-primary bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-40 text-xs py-2 px-4 gap-1.5 shrink-0 shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-900" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Kirim Pesanan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
