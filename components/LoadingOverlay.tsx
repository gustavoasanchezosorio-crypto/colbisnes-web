'use client';

export default function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-2xl shadow-2xl text-center">
        <div className="text-4xl mb-4 animate-spin">⏳</div>
        <p className="text-text">Procesando, por favor espera...</p>
      </div>
    </div>
  );
}
