"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface FaceAuthProps {
  mode: "register" | "verify";
  onSuccess: (descriptor: Float32Array) => void;
  onError?: (msg: string) => void;
  referenceDescriptor?: number[]; // Para verificación
}

const THEME = {
  electricBlue: "#1F6BFF",
  success: "#10B981",
  error: "#EF4444",
  warning: "#F59E0B",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F5",
  surface: "#FFFFFF",
};

export default function FaceAuth({ mode, onSuccess, onError, referenceDescriptor }: FaceAuthProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "scanning" | "success" | "error">("loading");
  const [message, setMessage] = useState("Cargando modelos de reconocimiento facial...");
  const [faceApi, setFaceApi] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  // Cargar face-api.js dinámicamente
  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        const fapi = await import("face-api.js");
        const MODEL_URL = "/models";
        await Promise.all([
          fapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          fapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) {
          setFaceApi(fapi);
          setStatus("ready");
          setMessage(
            mode === "register"
              ? "Modelos listos. Presiona el botón para registrar tu rostro."
              : "Modelos listos. Presiona el botón para verificar tu identidad."
          );
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Error cargando modelos de reconocimiento facial.");
          onError?.("Error cargando modelos");
        }
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, [mode, onError]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    if (!faceApi) return;
    setStatus("scanning");
    setMessage("Abriendo cámara...");
    setProgress(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMessage(
        mode === "register"
          ? "Mira directo a la cámara y mantente quieto..."
          : "Verificando tu identidad..."
      );

      let attempts = 0;
      const maxAttempts = 30;

      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || !faceApi) return;
        attempts++;
        setProgress(Math.min((attempts / maxAttempts) * 100, 95));

        try {
          const detection = await faceApi
            .detectSingleFace(videoRef.current, new faceApi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!detection) {
            if (attempts >= maxAttempts) {
              stopCamera();
              setStatus("error");
              setMessage("No se detectó ningún rostro. Intenta de nuevo con mejor iluminación.");
              onError?.("No se detectó rostro");
            }
            return;
          }

          // Dibujar detección en canvas
          const dims = faceApi.matchDimensions(canvasRef.current, videoRef.current, true);
          const resized = faceApi.resizeResults(detection, dims);
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            faceApi.draw.drawDetections(canvasRef.current, resized);
            faceApi.draw.drawFaceLandmarks(canvasRef.current, resized);
          }

          if (mode === "verify" && referenceDescriptor) {
            // Comparar con descriptor de referencia
            const refDescriptor = new Float32Array(referenceDescriptor);
            const distance = faceApi.euclideanDistance(detection.descriptor, refDescriptor);
            
            if (distance < 0.5) {
              // Coincide — umbral de 0.5 es estricto pero confiable
              stopCamera();
              setStatus("success");
              setProgress(100);
              setMessage("✅ Identidad verificada correctamente");
              onSuccess(detection.descriptor);
            } else if (attempts >= maxAttempts) {
              stopCamera();
              setStatus("error");
              setMessage("❌ No coincide con el rostro registrado. Acceso denegado.");
              onError?.("Rostro no coincide");
            }
          } else if (mode === "register") {
            // En registro, solo necesitamos detectar bien el rostro
            if (detection.detection.score > 0.85) {
              stopCamera();
              setStatus("success");
              setProgress(100);
              setMessage("✅ Rostro registrado exitosamente");
              onSuccess(detection.descriptor);
            }
          }
        } catch (err) {
          // Ignorar errores de frame individual
        }
      }, 300);

    } catch (err: any) {
      setStatus("error");
      setMessage(
        err.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Por favor permite el acceso a la cámara."
          : "Error al acceder a la cámara."
      );
      onError?.(err.message);
    }
  }, [faceApi, mode, referenceDescriptor, stopCamera, onSuccess, onError]);

  const statusColor = {
    loading: THEME.muted,
    ready: THEME.electricBlue,
    scanning: THEME.warning,
    success: THEME.success,
    error: THEME.error,
  }[status];

  const statusIcon = {
    loading: "⏳",
    ready: "📷",
    scanning: "🔍",
    success: "✅",
    error: "❌",
  }[status];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/* Camera viewport */}
      <div
        style={{
          position: "relative",
          width: 320,
          height: 240,
          borderRadius: 16,
          overflow: "hidden",
          background: "#0F172A",
          border: `2px solid ${statusColor}`,
          boxShadow: `0 0 0 4px ${statusColor}22`,
          transition: "border-color 0.3s, box-shadow 0.3s",
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: status === "scanning" || status === "success" ? "block" : "none",
            transform: "scaleX(1)",
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            transform: "none",
          }}
        />

        {/* Placeholder when camera is off */}
        {status !== "scanning" && status !== "success" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 48 }}>
              {status === "loading" ? "⏳" : status === "error" ? "❌" : "👤"}
            </div>
            <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "0 16px" }}>
              {status === "loading" ? "Cargando..." : status === "error" ? "Error" : "Cámara apagada"}
            </div>
          </div>
        )}

        {/* Scanning overlay corners */}
        {status === "scanning" && (
          <>
            {[
              { top: 8, left: 8, borderTop: "3px solid", borderLeft: "3px solid" },
              { top: 8, right: 8, borderTop: "3px solid", borderRight: "3px solid" },
              { bottom: 8, left: 8, borderBottom: "3px solid", borderLeft: "3px solid" },
              { bottom: 8, right: 8, borderBottom: "3px solid", borderRight: "3px solid" },
            ].map((corner, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: 24,
                  height: 24,
                  borderColor: THEME.electricBlue,
                  ...corner,
                }}
              />
            ))}
          </>
        )}

        {/* Progress bar */}
        {status === "scanning" && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              height: 3,
              width: `${progress}%`,
              background: THEME.electricBlue,
              transition: "width 0.3s",
            }}
          />
        )}
      </div>

      {/* Status message */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 12,
          background: `${statusColor}15`,
          border: `1px solid ${statusColor}30`,
          maxWidth: 320,
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 16 }}>{statusIcon}</span>
        <span style={{ fontSize: 13, color: statusColor, fontWeight: 600 }}>{message}</span>
      </div>

      {/* Action button */}
      {(status === "ready" || status === "error") && (
        <button
          onClick={startCamera}
          style={{
            padding: "12px 28px",
            borderRadius: 24,
            border: "none",
            background: `linear-gradient(135deg, #1448A3, #1F6BFF)`,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 4px 14px rgba(31,107,255,0.4)",
          }}
        >
          <span>📷</span>
          {mode === "register" ? "Registrar mi rostro" : "Verificar con mi rostro"}
        </button>
      )}
    </div>
  );
}
