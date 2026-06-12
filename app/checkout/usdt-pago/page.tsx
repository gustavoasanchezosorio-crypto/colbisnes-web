import { Suspense } from "react";
import USDTPagoContent from "./content";

export default function USDTPagoPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>
      <USDTPagoContent />
    </Suspense>
  );
}
