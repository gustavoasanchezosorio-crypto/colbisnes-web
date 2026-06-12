import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "Email y contrasena requeridos" }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Email ya registrado" }, { status: 400 });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name || null }
    });

    // Email de bienvenida
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Colbisnes <hola@colbisnes.com>",
        to: email,
        subject: "Heeyyy que chimba!!!",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E2E8F5">
          <div style="height:4px;background:linear-gradient(90deg,#0050CC,#00AAFF,#0050CC)"></div>
          <div style="padding:44px 32px;text-align:center">
            <div style="margin:0 0 28px">
              <h1 style="font-size:32px;font-weight:700;letter-spacing:0.18em;margin:0;background:linear-gradient(135deg,#0040CC,#0090FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent">COLBISNES</h1>
            </div>
            <div style="background:#F0F6FF;border:1px solid #C0D8FF;border-radius:16px;padding:20px;margin-bottom:20px">
              <h2 style="color:#0060E0;font-size:22px;font-weight:700;margin:0 0 6px">Que chimba, ya eres parte!</h2>
              <p style="color:#4A7AB8;font-size:13px;margin:0">De la mejor tienda de segunda mano de Colombia.</p>
            </div>
            <p style="font-size:14px;color:#64748B;margin:0 0 28px;line-height:1.8">Confirma tu correo electronico y empieza a hacer tu primer Bisnes &reg;</p>
            <a href="https://colbisnes-web.vercel.app/auth/login" style="display:inline-block;background:linear-gradient(135deg,#004DCC 0%,#0070FF 60%,#00AAFF 100%);color:#fff;padding:15px 44px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.04em;box-shadow:0 4px 20px rgba(0,100,255,0.25)">Confirmar mi correo</a>
            <div style="margin:28px auto 0;width:40px;height:1px;background:#E2E8F5"></div>
            <p style="color:#CBD5E1;font-size:10px;margin:12px 0 0;letter-spacing:0.04em">&copy; 2026 COLBISNES &mdash; Todos los derechos reservados</p>
          </div>
        </div>`,
      }),
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Error registro:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
