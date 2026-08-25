import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionById, getOrdersBySession } from "@/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionRow = await getSessionById(id);
  if (!sessionRow) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }
  const orders = await getOrdersBySession(id);
  return NextResponse.json({ ...sessionRow, orders });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body?.status != null) {
    updates.status = body.status;
    if (body.status === "closed") {
      updates.closedAt = new Date();
    } else if (body.status === "open") {
      updates.closedAt = null;
    }
  }
  if (body?.namaPenagih !== undefined) updates.namaPenagih = body.namaPenagih?.trim() || null;
  if (body?.namaBank !== undefined) updates.namaBank = body.namaBank?.trim() || null;
  if (body?.noRekening !== undefined) updates.noRekening = body.noRekening?.trim() || null;
  if (body?.biayaTambahan !== undefined) updates.biayaTambahan = Number(body.biayaTambahan);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Tidak ada field untuk diupdate" }, { status: 400 });
  }
  const [updated] = await db
    .update(sessions)
    .set(updates)
    .where(eq(sessions.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
