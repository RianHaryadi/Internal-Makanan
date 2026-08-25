import { db } from "./index";
import { warungs, menuItems, sessions, orders, orderItems } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Create warung
  const [warung] = await db
    .insert(warungs)
    .values({ nama: "Warung Ayam Penyet" })
    .returning();
  console.log(`  ✓ Warung: ${warung.nama} (${warung.id})`);

  // 2. Menu items
  const menus = [
    { namaItem: "Ayam Penyet Dada", harga: 15000 },
    { namaItem: "Ayam Penyet Paha", harga: 18000 },
    { namaItem: "Nasi Tambah", harga: 5000 },
    { namaItem: "Es Teh", harga: 8000 },
    { namaItem: "Es Jeruk", harga: 10000 },
  ];
  for (const m of menus) {
    await db.insert(menuItems).values({ ...m, warungId: warung.id });
  }
  console.log(`  ✓ ${menus.length} menu items added`);

  // 3. Create session
  const [session] = await db
    .insert(sessions)
    .values({
      warungId: warung.id,
      tanggal: new Date("2026-08-24"),
      namaPenagih: "Rian",
      namaBank: "BCA",
      noRekening: "1234567890",
      biayaTambahan: 30000,
    })
    .returning();
  console.log(`  ✓ Session: ${session.id}`);

  // 4. Orders
  const allMenus = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.warungId, warung.id));

  const [order1] = await db
    .insert(orders)
    .values({ sessionId: session.id, namaPemesan: "Rian" })
    .returning();
  await db.insert(orderItems).values([
    {
      orderId: order1.id,
      menuItemId: allMenus.find((m) => m.namaItem === "Ayam Penyet Dada")!.id,
      qty: 1,
    },
    {
      orderId: order1.id,
      menuItemId: allMenus.find((m) => m.namaItem === "Es Teh")!.id,
      qty: 1,
    },
  ]);

  const [order2] = await db
    .insert(orders)
    .values({ sessionId: session.id, namaPemesan: "Budi" })
    .returning();
  await db.insert(orderItems).values([
    {
      orderId: order2.id,
      menuItemId: allMenus.find((m) => m.namaItem === "Ayam Penyet Paha")!.id,
      qty: 1,
    },
  ]);

  const [order3] = await db
    .insert(orders)
    .values({ sessionId: session.id, namaPemesan: "Sari" })
    .returning();
  await db.insert(orderItems).values([
    {
      orderId: order3.id,
      menuItemId: allMenus.find((m) => m.namaItem === "Ayam Penyet Dada")!.id,
      qty: 1,
    },
    {
      orderId: order3.id,
      menuItemId: allMenus.find((m) => m.namaItem === "Nasi Tambah")!.id,
      qty: 1,
    },
  ]);

  console.log("  ✓ 3 orders with items added");
  console.log("\n✅ Seed complete!");
  console.log(`   Session ID: ${session.id}`);
  console.log(`   Order link: /pesan/${session.id}`);
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
