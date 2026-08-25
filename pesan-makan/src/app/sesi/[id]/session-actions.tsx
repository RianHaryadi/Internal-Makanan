"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Lock, Loader2, ExternalLink, MessageCircle } from "lucide-react";

export default function SessionActions({
  sessionId,
  orderLink,
  warungNama,
}: {
  sessionId: string;
  orderLink: string;
  warungNama?: string;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function closeSession() {
    if (
      !confirm(
        "Tutup sesi pemesanan ini? Peserta tidak akan bisa menambah/mengubah pesanan lagi, dan rekap tagihan akan dibuat otomatis."
      )
    ) {
      return;
    }
    setClosing(true);
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    setClosing(false);
    if (res.ok) {
      router.refresh();
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(orderLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareToWhatsApp() {
    const text = `Halo semuanya! Yuk pesan makan siang bareng di *${warungNama || "Warung"}* hari ini. Silakan pilih menu kamu lewat link berikut:\n\n${orderLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="space-y-2.5">
      {/* Share Card */}
      <div className="ui-card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700">
            Tautan Pemesanan Tim
          </span>
          <a
            href={orderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors"
          >
            <span>Buka form</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="bg-slate-50 rounded-md px-3 py-1.5 border border-slate-200 font-mono text-xs text-slate-700 truncate select-all">
          {orderLink}
        </div>

        <div className="flex gap-2 pt-0.5">
          <button
            onClick={copyLink}
            className={`ui-btn-secondary flex-1 text-xs py-1.5 gap-1.5 ${
              copied ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Salin Tautan</span>
              </>
            )}
          </button>

          <button
            onClick={shareToWhatsApp}
            className="ui-btn-primary flex-1 text-xs py-1.5 gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Bagikan ke WA</span>
          </button>
        </div>
      </div>

      {/* Close Session Action */}
      <button
        onClick={closeSession}
        disabled={closing}
        className="ui-btn-secondary w-full text-xs py-2 text-slate-700 hover:text-red-700 hover:border-red-200 hover:bg-red-50/30 gap-1.5"
      >
        {closing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Menutup Sesi...</span>
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Tutup Sesi & Selesaikan Pesanan</span>
          </>
        )}
      </button>
    </div>
  );
}
