import { NextResponse } from "next/server";
import { db } from "@/db";
import { menuItems } from "@/db/schema";

export async function POST(req: Request) {
  const body = await req.json();
  const { warungId, namaItem, harga } = body ?? {};
  if (!warungId || !namaItem?.trim() || harga == null) {
    return NextResponse.json(
      { error: "warungId, namaItem, dan harga wajib diisi" },
      { status: 400 }
    );
  }
  const [created] = await db
    .insert(menuItems)
    .values({
      warungId,
      namaItem: namaItem.trim(),
      harga: Number(harga),
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
