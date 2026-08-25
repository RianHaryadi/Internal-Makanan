import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  date,
  uniqueIndex,
  pgSchema,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// ── Warung (reusable restaurant records) ──────────────────────────────
export const warungs = pgTable("warungs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  nama: text("nama").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Menu items per warung (reusable) ───────────────────────────────────
export const menuItems = pgTable(
  "menu_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    warungId: text("warung_id")
      .notNull()
      .references(() => warungs.id, { onDelete: "cascade" }),
    namaItem: text("nama_item").notNull(),
    harga: integer("harga").notNull().default(0), // rupiah, no decimals
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("menu_items_warung_nama_idx").on(t.warungId, t.namaItem)]
);

// ── Session status enum ────────────────────────────────────────────────
export const sessionStatus = pgEnum("session_status", ["open", "closed"]);

// ── Sessions (one dining event) ───────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  warungId: text("warung_id")
    .notNull()
    .references(() => warungs.id, { onDelete: "restrict" }),
  tanggal: date("tanggal", { mode: "date" }).notNull().defaultNow(),
  status: sessionStatus("status").notNull().default("open"),
  namaPenagih: text("nama_penagih"),
  namaBank: text("nama_bank"),
  noRekening: text("no_rekening"),
  biayaTambahan: integer("biaya_tambahan").notNull().default(0),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Orders (one participant's order in a session) ─────────────────────
export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    namaPemesan: text("nama_pemesan").notNull(),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // one name = one order per session — prevents duplicate submissions
    uniqueIndex("orders_session_nama_idx").on(t.sessionId, t.namaPemesan),
  ]
);

// ── Order items (menu line items within an order) ────────────────────
export const orderItems = pgTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [uniqueIndex("order_items_order_menu_idx").on(t.orderId, t.menuItemId)]
);

// ── Type exports for ergonomics ───────────────────────────────────────
export type Warung = typeof warungs.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
