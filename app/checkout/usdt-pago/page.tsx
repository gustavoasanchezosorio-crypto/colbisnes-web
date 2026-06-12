"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function USDTPagoPage() {
  const params  = useSearchParams();
  const orderId = params.get("orderId");
  const total   = params.get("total");
  const wallet  = params.get("wallet");
  const [copiado, setCopiado] = useState(false);

  const copiar = () => {
    navigator.clipboard.writeText(wallet || "");
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Pago con USDT</h1>
      <p className="text-sm text-gray-500">Orden #{orderId}</p>
      <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-5 space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-500">Monto exacto a transferir</p>
          <p className="text-4xl font-bold text-orange-600">{total} USDT</p>
          <p className="text-xs text-gray-400 mt-1">Red: BNB Chain (BEP20)</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Wallet destino:</p>
          <div className="flex items-center gap-2 bg-white rounded-lg border border-orange-200 p-3">
            <p className="text-xs font-mono text-gray-700 flex-1 break-all">{wallet}</p>
            <button onClick={copiar} className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-bold shrink-0">
              {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1">
          <p className="font-bold">Importante:</p>
          <p>- Envia EXACTAMENTE {total} USDT.</p>
          <p>- Usa SOLO la red BNB Chain (BEP20).</p>
          <p>- No uses ERC20 ni TRC20, perderas tu dinero.</p>
          <p>- Confirmacion toma 1 a 5 minutos.</p>
        </div>
        <div className="bg-white border border-orange-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p className="font-bold text-gray-800">Pasos:</p>
          <p>1. Abre tu billetera (Trust Wallet, MetaMask, Binance).</p>
          <p>2. Selecciona USDT en red BEP20.</p>
          <p>3. Pega la wallet de arriba como destino.</p>
          <p>4. Ingresa el monto exacto.</p>
          <p>5. Confirma la transaccion.</p>
          <p>6. Colbisnes te notificara cuando el pago sea detectado.</p>
        </div>
      </div>
      <div className="text-center text-sm text-gray-400">Tienes 30 minutos para completar el pago.</div>
    </div>
  );
}
