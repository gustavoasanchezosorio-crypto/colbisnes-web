import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppProvider } from '@/context/AppContext';
import { ToastProvider } from '@/components/Toast';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Colbisnes",
  description: "Compra y venta de segunda mano en Colombia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>
          <AppProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AppProvider>
        </Providers>
      </body>
    </html>
  );
}
