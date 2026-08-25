import { NextResponse } from "next/server";
import { db } from "@/db";
import { warungs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWarungById, getMenuItemsByWarung } from "@/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const warung = await getWarungById(id);
  if (!warung) {
    return NextResponse.json({ error: "Warung tidak ditemukan" }, { status: 404 });
  }
  const menuItems = await getMenuItemsByWarung(id);
  return NextResponse.json({ warung, menuItems });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const nama = body?.nama?.trim();
  if (!nama) {
    return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  }
  const [updated] = await db
    .update(warungs)
    .set({ nama })
    .where(eq(warungs.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Warung tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(warungs).where(eq(warungs.id, id));
  return NextResponse.json({ ok: true });
}
