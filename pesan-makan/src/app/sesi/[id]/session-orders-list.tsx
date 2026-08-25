"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";
import {
  Users,
  Utensils,
  Search,
  Trash2,
  RotateCcw,
  Layers,
  User,
  X,
  Loader2,
  StickyNote,
} from "lucide-react";

interface OrderItem {
  id: string;
  namaItem: string;
  harga: number;
  qty: number;
}

interface Order {
  id: string;
  namaPemesan: string;
  catatan?: string | null;
  createdAt: Date | string;
  items: OrderItem[];
}

interface Props {
  sessionId: string;
  isOpen: boolean;
  orders: Order[];
}

export default function SessionOrdersList({
  sessionId,
  isOpen,
  orders,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"people" | "summary">("people");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Grouped summary of all ordered items across participants
  const itemSummaryMap = new Map<string, { namaItem: string; harga: number; totalQty: number; buyers: string[] }>();

  for (const o of orders) {
    for (const it of o.items) {
      const existing = itemSummaryMap.get(it.namaItem);
      if (existing) {
        existing.totalQty += it.qty;
        if (!existing.buyers.includes(o.namaPemesan)) {
          existing.buyers.push(o.namaPemesan);
        }
      } else {
        itemSummaryMap.set(it.namaItem, {
          namaItem: it.namaItem,
          harga: it.harga,
          totalQty: it.qty,
          buyers: [o.namaPemesan],
        });
      }
    }
  }

  const itemSummaryList = Array.from(itemSummaryMap.values()).sort(
    (a, b) => b.totalQty - a.totalQty
  );

  const totalFood = orders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.harga * i.qty, 0),
    0
  );

  const totalItemsCount = orders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0),
    0
  );

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    const matchName = o.namaPemesan.toLowerCase().includes(searchQuery.toLowerCase());
    const matchNote = (o.catatan || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchItem = o.items.some((it) =>
      it.namaItem.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return matchName || matchNote || matchItem;
  });

  const filteredSummary = itemSummaryList.filter((it) =>
    it.namaItem.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  async function handleDeleteOrder(id: string, nama: string) {
    if (!confirm(`Hapus pesanan atas nama "${nama}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="ui-card p-4 sm:p-5 space-y-3.5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900 text-sm">
            Daftar Pesanan Tim
          </h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {orders.length} orang • {totalItemsCount} porsi
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Muat Ulang Pesanan"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-slate-900" : ""}`}
            />
          </button>

          {/* View Mode Tabs */}
          {orders.length > 0 && (
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("people")}
                className={`py-1 px-2.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                  activeTab === "people"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <User className="w-3 h-3 text-slate-400" />
                <span>Per Orang</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`py-1 px-2.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                  activeTab === "summary"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers className="w-3 h-3 text-slate-400" />
                <span>Total Menu</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Filter if more than 3 orders */}
      {orders.length > 3 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama pemesan, catatan, atau menu..."
            className="ui-input w-full pl-7 pr-7 py-1.5 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {orders.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 text-center space-y-1">
          <Utensils className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-700">
            Belum ada pesanan masuk
          </p>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Bagikan tautan formulir di atas ke grup chat agar teman-teman bisa mulai memilih menu.
          </p>
        </div>
      ) : activeTab === "people" ? (
        /* Tab 1: Per Orang */
        <div className="space-y-2">
          {filteredOrders.length === 0 ? (
            <p className="text-slate-400 text-xs py-4 text-center">
              Tidak ada pesanan yang sesuai dengan &quot;{searchQuery}&quot;
            </p>
          ) : (
            filteredOrders.map((o, i) => {
              const foodTotal = o.items.reduce(
                (s, it) => s + it.harga * it.qty,
                0
              );
              return (
                <div
                  key={o.id}
                  className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-medium flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="font-semibold text-slate-900 text-sm">
                          {o.namaPemesan}
                        </span>
                      </div>

                      <div className="pl-7 space-y-0.5 mt-1">
                        {o.items.map((it, j) => (
                          <div
                            key={j}
                            className="text-xs text-slate-600 flex items-center justify-between gap-2"
                          >
                            <span>
                              {it.namaItem}{" "}
                              {it.qty > 1 && (
                                <span className="font-semibold text-slate-900 font-mono">
                                  (x{it.qty})
                                </span>
                              )}
                            </span>
                            <span className="text-slate-400 font-mono">
                              {formatRupiah(it.harga * it.qty)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Display Note if any */}
                      {o.catatan && (
                        <div className="pl-7 mt-1.5 flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-2 py-0.5 w-fit">
                          <StickyNote className="w-3 h-3 text-amber-600 shrink-0" />
                          <span className="font-medium">Catatan:</span>
                          <span>{o.catatan}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-slate-900 font-mono">
                        {formatRupiah(foodTotal)}
                      </span>

                      {/* Delete button (only when session open) */}
                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(o.id, o.namaPemesan)}
                          disabled={deletingId === o.id}
                          className="p-1 text-slate-300 hover:text-red-600 transition-colors rounded"
                          title={`Hapus pesanan ${o.namaPemesan}`}
                        >
                          {deletingId === o.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Tab 2: Total Menu Aggregation (Order at Warung Mode) */
        <div className="space-y-1.5">
          {filteredSummary.length === 0 ? (
            <p className="text-slate-400 text-xs py-4 text-center">
              Tidak ada menu yang sesuai dengan &quot;{searchQuery}&quot;
            </p>
          ) : (
            filteredSummary.map((it, idx) => (
              <div
                key={idx}
                className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-900 text-white font-bold text-xs flex items-center justify-center font-mono shrink-0">
                      {it.totalQty}x
                    </span>
                    <span className="font-semibold text-slate-900 text-sm truncate">
                      {it.namaItem}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-8 mt-0.5 truncate">
                    Pemesan: {it.buyers.join(", ")}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-slate-900 font-mono">
                    {formatRupiah(it.harga * it.totalQty)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Total Footer */}
      {orders.length > 0 && (
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600">
            Subtotal Makanan ({orders.length} orang)
          </span>
          <span className="font-bold text-slate-900 font-mono text-base">
            {formatRupiah(totalFood)}
          </span>
        </div>
      )}
    </div>
  );
}