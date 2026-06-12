"use client";

import { useState, useEffect } from "react";
import { calcularPrecioOnline, calcularPrecioContraEntrega, calcularPrecioUSDT } from "@/lib/pricing";

type MetodoPago = "online" | "contraentrega" | "usdt";
interface Producto { id: string; nombre: string; precio: number; }
interface Props { producto: Producto; }

export default function CheckoutPage({ producto }: Props) {
  const [metodo, setMetodo]   = useState<MetodoPago | null>(null);
  const [tasa, setTasa]       = useState<number>(4200);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/tasa-usdt").then(r => r.json()).then(d => { if (d.tasa) setTasa(d.tasa); });
  }, []);

  const online = calcularPrecioOnline(producto.precio);
  const contra = calcularPrecioContraEntrega(producto.precio);
  const usdt   = calcularPrecioUSDT(producto.precio, tasa);
  const fmt    = (n: number) => "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

  const handleContinuar = async () => {
    setLoading(true);
    if (metodo === "online") {
      window.location.href = `/api/checkout/wompi?productoId=${producto.id}`;
    } else if (metodo === "contraentrega") {
      const res  = await fetch("/api/checkout/contra-entrega", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productoId: producto.id }) });
      const data = await res.json();
      if (data.ok) window.location.href = `/checkout/confirmacion?orderId=${data.ordenId}`;
    } else if (metodo === "usdt") {
      const res  = await fetch("/api/checkout/usdt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productoId: producto.id, tasaCOP: tasa }) });
      const data = await res.json();
      if (data.ok) window.location.href = `/checkout/usdt-pago?orderId=${data.ordenId}&total=${data.totalUSDT}&wallet=${data.wallet}`;
    }
    setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Finalizar compra</h1>
      <p className="text-gray-600 text-sm">{producto.nombre}</p>
      <p className="text-2xl font-bold text-yellow-600">{fmt(producto.precio)}</p>
      <p className="font-semibold text-gray-700">Elige como pagar:</p>

      <button onClick={() => setMetodo("online")} className={`w-full border-2 rounded-xl p-4 text-left transition-all ${metodo === "online" ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-yellow-300"}`}>
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold">Pago online seguro</p>
            <p className="text-sm text-gray-500">Tarjeta, PSE, Nequi</p>
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Comision 10%</span>
          </div>
          <div className="text-right"><p className="text-xs text-gray-400">Total</p><p className="font-bold text-yellow-600">{fmt(online.totalComprador)}</p></div>
        </div>
        {metodo === "online" && (
          <div className="mt-3 pt-3 border-t border-yellow-200 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Precio producto</span><span>{fmt(online.precioBase)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Comision (10%)</span><span>{fmt(online.comisionColbisnes)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1 text-yellow-700"><span>Total</span><span>{fmt(online.totalComprador)}</span></div>
            <p className="text-xs text-gray-400 mt-1">Dinero retenido hasta confirmar entrega. Si hay problemas te devolvemos el dinero.</p>
          </div>
        )}
      </button>

      <button onClick={() => setMetodo("contraentrega")} className={`w-full border-2 rounded-xl p-4 text-left transition-all ${metodo === "contraentrega" ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-green-300"}`}>
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold">Contra entrega <span className="ml-1 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">Solo 3%</span></p>
            <p className="text-sm text-gray-500">Pagas en efectivo al recibir</p>
          </div>
          <div className="text-right"><p className="text-xs text-gray-400">Total</p><p className="font-bold text-green-600">{fmt(contra.totalComprador)}</p></div>
        </div>
        {metodo === "contraentrega" && (
          <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Precio producto</span><span>{fmt(contra.precioBase)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Comision (3%)</span><span>{fmt(contra.comisionColbisnes)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1 text-green-700"><span>Total al mensajero</span><span>{fmt(contra.totalComprador)}</span></div>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
              <p className="font-bold">Como funciona:</p>
              <p>1. Vendedor empaca y sube fotos en Colbisnes.</p>
              <p>2. Recibes codigo secreto de 6 digitos por correo.</p>
              <p>3. Mensajeria entrega el paquete.</p>
              <p>4. Tienes 5 minutos para inspeccionar.</p>
              <p>5. Si todo bien, pagas y das el codigo al mensajero.</p>
              <p className="font-semibold text-blue-900">Sin codigo el mensajero devuelve el paquete.</p>
            </div>
          </div>
        )}
      </button>

      <button onClick={() => setMetodo("usdt")} className={`w-full border-2 rounded-xl p-4 text-left transition-all ${metodo === "usdt" ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-orange-300"}`}>
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold">Pagar con USDT <span className="ml-1 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">Solo 5%</span></p>
            <p className="text-sm text-gray-500">BNB Chain BEP20 sin bancos</p>
          </div>
          <div className="text-right"><p className="text-xs text-gray-400">Total</p><p className="font-bold text-orange-600">{usdt.totalUSD} USDT</p></div>
        </div>
        {metodo === "usdt" && (
          <div className="mt-3 pt-3 border-t border-orange-200 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Precio producto</span><span>{usdt.precioBaseUSD} USDT</span></div>
            <div className="flex justify-between text-gray-600"><span>Comision (5%)</span><span>{usdt.comisionUSD} USDT</span></div>
            <div className="flex justify-between font-bold border-t pt-1 text-orange-700"><span>Total a transferir</span><span>{usdt.totalUSD} USDT</span></div>
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-900 space-y-1">
              <p className="font-bold">Como funciona USDT:</p>
              <p>1. Confirmas la orden en Colbisnes.</p>
              <p>2. Ves la wallet y el monto exacto a transferir.</p>
              <p>3. Haces la transferencia desde tu billetera BEP20.</p>
              <p>4. Colbisnes confirma el pago en blockchain.</p>
              <p>5. Vendedor recibe su pago al confirmar entrega.</p>
              <p className="font-semibold">Tasa actual: 1 USD = {fmt(tasa)} COP</p>
            </div>
          </div>
        )}
      </button>

      {metodo && (
        <button onClick={handleContinuar} disabled={loading} className="w-full py-4 rounded-xl font-bold text-lg bg-yellow-400 hover:bg-yellow-500 transition disabled:opacity-50">
          {loading ? "Procesando..." : `Continuar con ${metodo === "online" ? "pago online" : metodo === "contraentrega" ? "contra entrega" : "USDT"}`}
        </button>
      )}
    </div>
  );
}
