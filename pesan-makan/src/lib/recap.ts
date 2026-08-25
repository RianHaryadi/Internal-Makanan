import { formatRupiah, formatDateID } from "./utils";

// ── Types matching the data we'll query ───────────────────────────────
export interface RecapOrderData {
  namaPemesan: string;
  catatan?: string | null;
  items: {
    namaItem: string;
    qty: number;
    harga: number;
  }[];
}

export interface RecapSessionData {
  warungNama: string;
  tanggal: Date | string;
  biayaTambahan: number;
  namaPenagih: string | null;
  namaBank: string | null;
  noRekening: string | null;
  orders: RecapOrderData[];
}

// ── Helpers ───────────────────────────────────────────────────────────
function itemTotal(items: { namaItem: string; qty: number; harga: number }[]) {
  return items.reduce((sum, i) => sum + i.harga * i.qty, 0);
}

function itemLabel(items: { namaItem: string; qty: number; harga: number }[]) {
  return items
    .map((i) => (i.qty > 1 ? `${i.namaItem} (x${i.qty})` : i.namaItem))
    .join(" + ");
}

// ── Rekap ke Warung (no prices, with notes for kitchen) ─────────────────
export function generateWarungRecap(s?: RecapSessionData | null): string {
  if (!s) return "";
  const header = `🍽️ *Pesanan - ${s.warungNama || "Warung"}* (${formatDateID(s.tanggal || new Date())})`;
  const lines = (s.orders || []).map((o, i) => {
    const label = itemLabel(o.items || []);
    const note = o.catatan ? ` _(Note: ${o.catatan})_` : "";
    return `${i + 1}. ${o.namaPemesan}: ${label}${note}`;
  });
  return [header, "", ...lines, "", `Total: ${(s.orders || []).length} porsi/orang`].join("\n");
}

// ── Rekap Tagihan ke Grup WA (with prices + notes + ongkir split) ──────
export function generateBillingRecap(s?: RecapSessionData | null): string {
  if (!s) return "";
  const header = `💰 *Rekap Tagihan Makan Siang - ${s.warungNama || "Warung"}*\n📅 Tanggal: ${formatDateID(s.tanggal || new Date())}`;
  const orders = s.orders || [];
  const orderCount = orders.length;
  const ongkirPerPerson =
    orderCount > 0 && (s.biayaTambahan || 0) > 0
      ? Math.floor((s.biayaTambahan || 0) / orderCount)
      : 0;

  const lines = orders.map((o, i) => {
    const foodTotal = itemTotal(o.items || []);
    const label = itemLabel(o.items || []);
    const total = foodTotal + ongkirPerPerson;
    const noteLine = o.catatan ? `\n   📝 _Note: ${o.catatan}_` : "";

    if ((s.biayaTambahan || 0) > 0 && orderCount > 0) {
      return `${i + 1}. *${o.namaPemesan}* - ${label}${noteLine}\n   ↳ ${formatRupiah(foodTotal)} + ongkir ${formatRupiah(ongkirPerPerson)} = *${formatRupiah(total)}*`;
    }

    return `${i + 1}. *${o.namaPemesan}* - ${label}${noteLine} = *${formatRupiah(total)}*`;
  });

  const totalFood = orders.reduce(
    (sum, o) => sum + itemTotal(o.items || []),
    0
  );
  const totalSemua = totalFood + (s.biayaTambahan || 0);

  const summaryLines = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `Subtotal Makanan: ${formatRupiah(totalFood)}`,
  ];

  if ((s.biayaTambahan || 0) > 0) {
    summaryLines.push(`Ongkir / Tambahan: ${formatRupiah(s.biayaTambahan)} (${formatRupiah(ongkirPerPerson)}/org)`);
  }

  summaryLines.push(`*Total Keseluruhan: ${formatRupiah(totalSemua)}*`);

  const parts = [
    header,
    "",
    "📋 *Rincian Pesanan:*",
    ...lines,
    "",
    ...summaryLines,
  ];

  // Add bank transfer info if present
  if (s.namaBank || s.noRekening || s.namaPenagih) {
    parts.push(
      "",
      `💳 *Transfer Pembayaran ke:*`,
      `${s.namaBank ?? "Bank"} ${s.noRekening ?? "-"} a.n. ${s.namaPenagih ?? "-"}`
    );
  }

  return parts.join("\n");
}

