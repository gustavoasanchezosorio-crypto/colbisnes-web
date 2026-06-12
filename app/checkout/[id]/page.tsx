"use client";

import { useState } from "react";
import { calcularPrecioOnline, calcularPrecioContraEntrega } from "@/lib/pricing";

type MetodoPago = "online" | "contraentrega";

interface Producto {
  id: string;
  nombre: string;
  precio: number;
}

interface Props {
  producto: Producto;
}

export default function CheckoutPage({ producto }: Props) {
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);

  const online = calcularPrecioOnline(producto.precio);
  const contra = calcularPrecioContraEntrega(producto.precio);
  const fmt    = (n: number) => "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

  const handleContinuar = async () => {
    if (metodo === "online") {
      window.location.href = `/api/checkout/wompi?productoId=${producto.id}`;
    } else {
      const res = await fetch("/api/checkout/contra-entrega", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoId: producto.id }),
      });
      const data = await res.json();
      if (data.ok) window.location.href = `/checkout/confirmacion?orderId=${data.ordenId}`;
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Finalizar compra</h1>
      <p className="text-gray-600 text-sm">{producto.nombre}</p>
      <p className="text-2xl font-bold text-yellow-600">{fmt(producto.precio)}</p>

      <p className="font-semibold text-gray-700">Elige como pagar:</p>

      {/* PAGO ONLINE */}
      <button
        onClick={() => setMetodo("online")}
        className={`w-full border-2 rounded-xl p-4 text-left transition-all ${
          metodo === "online" ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-yellow-300"
        }`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold">Pago online seguro</p>
            <p className="text-sm text-gray-500">Tarjeta, PSE, Nequi</p>
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Comision 10%</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total</p>
            <p className="font-bold text-yellow-600">{fmt(online.totalComprador)}</p>
          </div>
        </div>
        {metodo === "online" && (
          <div className="mt-3 pt-3 border-t border-yellow-200 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Precio del producto</span><span>{fmt(online.precioBase)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Comision Colbisnes (10%)</span><span>{fmt(online.comisionColbisnes)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1 text-yellow-700"><span>Total a pagar</span><span>{fmt(online.totalComprador)}</span></div>
            <p className="text-xs text-gray-400 mt-1">Tu dinero queda retenido en Colbisnes hasta confirmar la entrega. Si hay algun problema, te devolvemos el dinero.</p>
          </div>
        )}
      </button>

      {/* CONTRA ENTREGA */}
      <button
        onClick={() => setMetodo("contraentrega")}
        className={`w-full border-2 rounded-xl p-4 text-left transition-all ${
          metodo === "contraentrega" ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-green-300"
        }`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold">
              Pago contra entrega
              <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">Solo 3%</span>
            </p>
            <p className="text-sm text-gray-500">Pagas en efectivo al recibir</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total</p>
            <p className="font-bold text-green-600">{fmt(contra.totalComprador)}</p>
          </div>
        </div>
        {metodo === "contraentrega" && (
          <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Precio del producto</span><span>{fmt(contra.precioBase)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Comision Colbisnes (3%)</span><span>{fmt(contra.comisionColbisnes)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1 text-green-700"><span>Total a pagar al mensajero</span><span>{fmt(contra.totalComprador)}</span></div>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
              <p className="font-bold text-sm">Como funciona el contra entrega:</p>
              <p>1. El vendedor empaca y sube fotos en Colbisnes.</p>
              <p>2. Recibes un codigo secreto de 6 digitos en tu correo.</p>
              <p>3. La mensajeria te entrega el paquete.</p>
              <p>4. Tienes 5 minutos para inspeccionar el producto.</p>
              <p>5. Si todo esta bien, pagas y das el codigo al mensajero.</p>
              <p>6. Sin codigo, el mensajero devuelve el paquete. Tu dinero siempre protegido.</p>
            </div>
          </div>
        )}
      </button>

      {metodo && (
        <button
          onClick={handleContinuar}
          className="w-full py-4 rounded-xl font-bold text-lg bg-yellow-400 hover:bg-yellow-500 transition"
        >
          Continuar con {metodo === "online" ? "pago online" : "contra entrega"}
        </button>
      )}
    </div>
  );
}
