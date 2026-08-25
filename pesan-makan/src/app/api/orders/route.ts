import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json();
  const { sessionId, namaPemesan, items, catatan } = body ?? {};

  // Validate
  if (!sessionId || !namaPemesan?.trim() || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "sessionId, namaPemesan, dan items wajib diisi" },
      { status: 400 }
    );
  }

  // Check for duplicate name in this session
  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.sessionId, sessionId), eq(orders.namaPemesan, namaPemesan.trim())));
  if (existing) {
    return NextResponse.json(
      { error: "Nama ini sudah memesan di sesi ini" },
      { status: 409 }
    );
  }

  // Insert order
  const [order] = await db
    .insert(orders)
    .values({
      sessionId,
      namaPemesan: namaPemesan.trim(),
      catatan: catatan?.trim() || null,
    })
    .returning();

  // Insert order items
  const itemRows = (items as Array<{ menuItemId?: string; qty?: number }>)
    .filter((i) => i.menuItemId && i.qty && i.qty > 0)
    .map((i) => ({
      orderId: order.id,
      menuItemId: i.menuItemId!,
      qty: Number(i.qty),
    }));

  if (itemRows.length > 0) {
    await db.insert(orderItems).values(itemRows);
  }

  return NextResponse.json({ ...order, items: itemRows }, { status: 201 });
}
