import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Email ya registrado" }, { status: 400 });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name || null }
    });
    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Error registro:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
