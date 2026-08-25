import { db } from "./index";
import {
  warungs,
  menuItems,
  sessions,
  orders,
  orderItems,
} from "./schema";
import { eq, desc } from "drizzle-orm";
import type { RecapSessionData } from "@/lib/recap";

// ── Warung queries ────────────────────────────────────────────────────
export async function getAllWarungs() {
  return db.select().from(warungs).orderBy(desc(warungs.createdAt));
}

export async function getWarungById(id: string) {
  const [w] = await db.select().from(warungs).where(eq(warungs.id, id));
  return w ?? null;
}

export async function getMenuItemsByWarung(warungId: string) {
  return db
    .select()
    .from(menuItems)
    .where(eq(menuItems.warungId, warungId))
    .orderBy(desc(menuItems.createdAt));
}

// ── Session queries ──────────────────────────────────────────────────
export async function getAllSessions() {
  return db
    .select({
      session: sessions,
      warung: warungs,
    })
    .from(sessions)
    .leftJoin(warungs, eq(sessions.warungId, warungs.id))
    .orderBy(desc(sessions.createdAt));
}

export async function getSessionById(id: string) {
  const [row] = await db
    .select({
      session: sessions,
      warung: warungs,
    })
    .from(sessions)
    .leftJoin(warungs, eq(sessions.warungId, warungs.id))
    .where(eq(sessions.id, id));
  return row ?? null;
}

// ── Order queries (with nested items) ─────────────────────────────────
export async function getOrdersBySession(sessionId: string) {
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.sessionId, sessionId))
    .orderBy(orders.createdAt);

  const allItems = await db
    .select({
      orderItem: orderItems,
      menu: menuItems,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(eq(orders.sessionId, sessionId));

  return allOrders.map((o) => ({
    ...o,
    items: allItems
      .filter((i) => i.orderItem.orderId === o.id)
      .map((i) => ({
        id: i.orderItem.id,
        namaItem: i.menu.namaItem,
        harga: i.menu.harga,
        qty: i.orderItem.qty,
      })),
  }));
}

// ── Get full session data for recap generation ───────────────────────
export async function getSessionRecapData(
  sessionId: string
): Promise<RecapSessionData | null> {
  const sessionRow = await getSessionById(sessionId);
  if (!sessionRow) return null;

  const orderRows = await getOrdersBySession(sessionId);

  return {
    warungNama: sessionRow.warung?.nama ?? "Unknown",
    tanggal: sessionRow.session.tanggal,
    biayaTambahan: sessionRow.session.biayaTambahan,
    namaPenagih: sessionRow.session.namaPenagih,
    namaBank: sessionRow.session.namaBank,
    noRekening: sessionRow.session.noRekening,
    orders: orderRows.map((o) => ({
      namaPemesan: o.namaPemesan,
      catatan: o.catatan,
      items: o.items.map((i) => ({
        namaItem: i.namaItem,
        qty: i.qty,
        harga: i.harga,
      })),
    })),
  };
}

// ── Order by ID (for deletion) ────────────────────────────────────────
export async function getOrderById(id: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  return o ?? null;
}

export async function getMenuItemById(id: string) {
  const [m] = await db.select().from(menuItems).where(eq(menuItems.id, id));
  return m ?? null;
}
