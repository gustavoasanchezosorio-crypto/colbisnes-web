import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, phone: true, city: true, image: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const body = await request.json();
    const { name, phone, city, image } = body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (city !== undefined) updateData.city = city;
    if (image !== undefined) updateData.image = image;
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, city: true, image: true, createdAt: true },
    });
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("PATCH /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
