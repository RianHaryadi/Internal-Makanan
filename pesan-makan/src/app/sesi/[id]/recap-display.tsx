"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateWarungRecap, generateBillingRecap } from "@/lib/recap";
import type { RecapSessionData } from "@/lib/recap";
import { formatRupiah } from "@/lib/utils";
import {
  Copy,
  Check,
  MessageCircle,
  Utensils,
  Receipt,
  Loader2,
  Edit3,
} from "lucide-react";

interface Props {
  sessionId: string;
  status: "open" | "closed";
  initialData: RecapSessionData;
}

export default function RecapDisplay({ sessionId, status, initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [namaPenagih, setNamaPenagih] = useState(initialData.namaPenagih ?? "");
  const [namaBank, setNamaBank] = useState(initialData.namaBank ?? "");
  const [noRekening, setNoRekening] = useState(initialData.noRekening ?? "");
  const [biayaTambahan, setBiayaTambahan] = useState(String(initialData.biayaTambahan ?? 0));

  const [sessionData, setSessionData] = useState<RecapSessionData>(initialData);
  const [activeTab, setActiveTab] = useState<"billing" | "warung">("billing");
  const [copiedWarung, setCopiedWarung] = useState(false);
  const [copiedBilling, setCopiedBilling] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(
    !initialData.namaPenagih && !initialData.noRekening
  );

  const numericBiayaTambahan = Number(biayaTambahan) || 0;
  const currentData: RecapSessionData = {
    ...sessionData,
    namaPenagih: namaPenagih.trim() || null,
    namaBank: namaBank.trim() || null,
    noRekening: noRekening.trim() || null,
    biayaTambahan: numericBiayaTambahan,
  };

  const warungText = generateWarungRecap(currentData);
  const billingText = generateBillingRecap(currentData);
  const currentText = activeTab === "billing" ? billingText : warungText;
  const isCopied = activeTab === "billing" ? copiedBilling : copiedWarung;

  async function handleSavePayment(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSavingPayment(true);
    setSavedSuccess(false);

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namaPenagih: namaPenagih.trim() || null,
          namaBank: namaBank.trim() || null,
          noRekening: noRekening.trim() || null,
          biayaTambahan: numericBiayaTambahan,
        }),
      });

      if (res.ok) {
        setSessionData(currentData);
        setSavedSuccess(true);
        setIsEditingPayment(false);
        setTimeout(() => setSavedSuccess(false), 2000);
        startTransition(() => {
          router.refresh();
        });
      }
    } finally {
      setSavingPayment(false);
    }
  }

  async function copy(text: string, which: "warung" | "billing") {
    await navigator.clipboard.writeText(text);
    if (which === "warung") {
      setCopiedWarung(true);
      setTimeout(() => setCopiedWarung(false), 2000);
    } else {
      setCopiedBilling(true);
      setTimeout(() => setCopiedBilling(false), 2000);
    }
  }

  function sendToWhatsApp(text: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="ui-card p-4 sm:p-5 space-y-5">
      {/* 1. Pengaturan Pembayaran & Ongkir */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Rekening Pembayaran & Ongkir
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Info ini otomatis dimasukkan ke teks rekap WhatsApp secara langsung.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsEditingPayment(!isEditingPayment)}
            className="ui-btn-secondary text-xs px-2.5 py-1 gap-1"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditingPayment ? "Tutup" : "Ubah Data"}</span>
          </button>
        </div>

        {/* Summary Card */}
        {!isEditingPayment && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Tujuan Transfer:</span>
              <p className="font-medium text-slate-900 mt-0.5 font-mono">
                {namaBank || noRekening ? (
                  `${namaBank || "Bank"} ${noRekening || "-"} a.n. ${namaPenagih || "-"}`
                ) : (
                  <span className="text-slate-400 italic font-sans font-normal">Belum diatur</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Ongkir / Biaya Tambahan:</span>
              <p className="font-medium text-slate-900 mt-0.5">
                {numericBiayaTambahan > 0 ? (
                  `${formatRupiah(numericBiayaTambahan)} (dibagi rata)`
                ) : (
                  "Tidak ada (Rp 0)"
                )}
              </p>
            </div>
          </div>
        )}

        {/* Edit Form */}
        {isEditingPayment && (
          <form
            onSubmit={handleSavePayment}
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Nama Penerima Transfer
                </label>
                <input
                  type="text"
                  value={namaPenagih}
                  onChange={(e) => setNamaPenagih(e.target.value)}
                  placeholder="mis. Rian"
                  className="ui-input w-full px-3 py-1.5 text-xs font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Bank / e-Wallet
                </label>
                <input
                  type="text"
                  value={namaBank}
                  onChange={(e) => setNamaBank(e.target.value)}
                  placeholder="mis. BCA, Mandiri, GoPay"
                  className="ui-input w-full px-3 py-1.5 text-xs font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Nomor Rekening / No. HP
                </label>
                <input
                  type="text"
                  value={noRekening}
                  onChange={(e) => setNoRekening(e.target.value)}
                  placeholder="mis. 5420123456"
                  className="ui-input w-full px-3 py-1.5 text-xs font-mono font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Biaya Tambahan (Ongkir/Parkir)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
                    Rp
                  </span>
                  <input
                    type="number"
                    value={biayaTambahan}
                    onChange={(e) => setBiayaTambahan(e.target.value)}
                    placeholder="0"
                    className="ui-input w-full pl-7 pr-3 py-1.5 text-xs font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingPayment}
                className="ui-btn-primary text-xs px-3.5 py-1.5 gap-1.5"
              >
                {savingPayment ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Tersimpan</span>
                  </>
                ) : (
                  <span>Simpan Data</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="h-px bg-slate-100" />

      {/* 2. Format Rekap WhatsApp */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Rekap Pesanan WhatsApp
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih format teks di bawah, salin atau langsung kirim ke grup chat.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("billing")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
              activeTab === "billing"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Tagihan Tim</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("warung")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
              activeTab === "warung"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Pesanan ke Penjual</span>
          </button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-slate-500">
            {activeTab === "billing" ? "Rincian per orang + rekening" : "Rincian item bersih untuk penjual"}
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copy(currentText, activeTab)}
              className={`ui-btn-secondary text-xs px-3 py-1.5 gap-1.5 ${
                isCopied ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Salin Teks</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => sendToWhatsApp(currentText)}
              className="ui-btn-primary text-xs px-3 py-1.5 gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Buka WA</span>
            </button>
          </div>
        </div>

        {/* Text Preview */}
        <pre className="bg-slate-900 text-slate-100 rounded-lg p-3.5 text-xs font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto select-all border border-slate-800">
          {currentText}
        </pre>
      </div>
    </div>
  );
}
