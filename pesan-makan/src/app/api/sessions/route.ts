import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { getAllSessions } from "@/db/queries";

export async function GET() {
  const list = await getAllSessions();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { warungId, tanggal, namaPenagih, namaBank, noRekening, biayaTambahan } = body ?? {};
  if (!warungId) {
    return NextResponse.json({ error: "warungId wajib diisi" }, { status: 400 });
  }
  const [created] = await db
    .insert(sessions)
    .values({
      warungId,
      tanggal: tanggal ? new Date(tanggal) : new Date(),
      namaPenagih: namaPenagih?.trim() || null,
      namaBank: namaBank?.trim() || null,
      noRekening: noRekening?.trim() || null,
      biayaTambahan: biayaTambahan ? Number(biayaTambahan) : 0,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
