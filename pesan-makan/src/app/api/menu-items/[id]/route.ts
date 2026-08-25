import { NextResponse } from "next/server";
import { db } from "@/db";
import { menuItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMenuItemById } from "@/db/queries";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body?.namaItem != null) updates.namaItem = body.namaItem.trim();
  if (body?.harga != null) updates.harga = Number(body.harga);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Tidak ada field untuk diupdate" }, { status: 400 });
  }
  const [updated] = await db
    .update(menuItems)
    .set(updates)
    .where(eq(menuItems.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Menu tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(menuItems).where(eq(menuItems.id, id));
  return NextResponse.json({ ok: true });
}
