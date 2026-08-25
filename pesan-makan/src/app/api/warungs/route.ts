import { NextResponse } from "next/server";
import { db } from "@/db";
import { warungs } from "@/db/schema";
import { getAllWarungs } from "@/db/queries";

export async function GET() {
  const list = await getAllWarungs();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  const nama = body?.nama?.trim();
  if (!nama) {
    return NextResponse.json({ error: "Nama warung wajib diisi" }, { status: 400 });
  }
  const [created] = await db
    .insert(warungs)
    .values({ nama })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
