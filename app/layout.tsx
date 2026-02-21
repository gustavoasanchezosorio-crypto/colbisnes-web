import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ExpirationPoller from "@/app/components/ExpirationPoller";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Colbisnes",
  description: "Marketplace con sistema automático de expiración de pagos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* 🔁 Liberación automática de pagos vencidos */}
        <ExpirationPoller />

        {children}
      </body>
    </html>
  );
}