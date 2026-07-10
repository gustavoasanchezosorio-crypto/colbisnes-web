"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, OutlineButton } from "@/components/FormComponents";
import { THEME } from "@/lib/theme";

const AZUL = THEME.primary;

// Helpers de validación
const soloLetras    = (v: string) => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]/g, "");
const soloNumeros   = (v: string) => v.replace(/[^0-9]/g, "");
const soloAlfa     = (v: string) => v.replace(/[^a-zA-Z0-9]/g, ""); // wallet: hex, base58, etc

const inpBase: React.CSSProperties = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
  border: "1.5px solid " + THEME.border, fontSize: "0.92rem",
  outline: "none", boxSizing: "border-box" as const,
  fontFamily: "inherit", background: "#ffffff", color: THEME.text,
};

// Prefijo +57 visual para teléfonos — definido FUERA del componente para que React
// no lo trate como un tipo de componente nuevo en cada render (eso causaba que el
// input perdiera el foco tras cada tecla, impidiendo escribir con continuidad).
function PhoneInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
      <div style={{ padding: "0.75rem 0.85rem", background: "#eef3fb", border: "1.5px solid " + THEME.border, borderRight: "none", borderRadius: "10px 0 0 10px", fontSize: "0.88rem", fontWeight: 700, color: THEME.primary, whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
        🇨🇴 +57
      </div>
      <input
        style={{ ...inpBase, borderRadius: "0 10px 10px 0", flex: 1 }}
        type="tel" inputMode="numeric"
        value={value}
        onChange={e => onChange(soloNumeros(e.target.value))}
        onPaste={e => {
          e.preventDefault();
          const pasted = soloNumeros(e.clipboardData.getData("text"));
          onChange(pasted.slice(0, 10));
        }}
        placeholder={placeholder}
        maxLength={10}
      />
    </div>
  );
}

export default function EditarPerfilPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Verificación premium (badge, sin cobro)
  const [premiumStatus, setPremiumStatus] = useState<string>("none");
  const [premiumCedula, setPremiumCedula] = useState<File | null>(null);
  const [premiumComprobante, setPremiumComprobante] = useState<File | null>(null);
  const [premiumEnviando, setPremiumEnviando] = useState(false);
  const [premiumMsg, setPremiumMsg] = useState("");

  const [formData, setFormData] = useState({
    name: "", phone: "", city: "", image: "",
    nequiNumber: "", brebId: "",
    phoneWhatsapp: "", usdtWallet: "", usdtRed: "BEP20", direccionEnvio: "",
    antiPhishingCode: "",
  });

  const [geoErrorMsg, setGeoErrorMsg] = useState("");

  const detectarCiudad = () => {
    setGeoErrorMsg("");
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeoErrorMsg("Tu navegador no soporta geolocalización");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=es`);
          if (!res.ok) throw new Error("Servicio de ubicación no disponible");
          const data = await res.json();
          const ciudad = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
          if (ciudad) setFormData(f => ({ ...f, city: ciudad }));
          else setGeoErrorMsg("No se pudo identificar tu ciudad, escríbela manualmente");
        } catch (err) {
          console.error("Error detectando ciudad:", err);
          setGeoErrorMsg("No se pudo obtener la ciudad. Escríbela manualmente.");
        } finally { setGeoLoading(false); }
      },
      (err) => {
        console.error("Error de geolocalización:", err);
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoErrorMsg("Permiso de ubicación denegado. Actívalo en los ajustes de tu navegador y vuelve a intentar.");
        } else if (err.code === err.TIMEOUT) {
          setGeoErrorMsg("Se agotó el tiempo esperando tu ubicación. Intenta de nuevo.");
        } else {
          setGeoErrorMsg("No se pudo acceder a tu ubicación.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/user", { credentials: "include" })
        .then(res => { if (!res.ok) throw new Error("Error al cargar perfil"); return res.json(); })
        .then(data => {
          setFormData({
            name: data.name || "", phone: data.phone || "", city: data.city || "", image: data.image || "",
            nequiNumber: data.nequiNumber || "", brebId: data.brebId || "",
            phoneWhatsapp: data.phoneWhatsapp || "", usdtWallet: data.usdtWallet || "",
            usdtRed: data.usdtRed || "BEP20", direccionEnvio: data.direccionEnvio || "",
            antiPhishingCode: data.antiPhishingCode || "",
          });
          setLoading(false);
        })
        .catch(err => { console.error(err); alert("Error al cargar los datos del perfil"); setLoading(false); });
      fetch("/api/premium/solicitar", { credentials: "include" })
        .then(r => r.json())
        .then(d => { if (d?.premiumStatus) setPremiumStatus(d.premiumStatus); })
        .catch(() => {});
    }
  }, [session]);

  const solicitarPremium = async () => {
    setPremiumMsg("");
    if (!premiumCedula || !premiumComprobante) {
      setPremiumMsg("❌ Adjunta la cédula y el comprobante de domicilio");
      return;
    }
    setPremiumEnviando(true);
    try {
      const fd = new FormData();
      fd.append("cedula", premiumCedula);
      fd.append("comprobante", premiumComprobante);
      const res = await fetch("/api/premium/solicitar", { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar la solicitud");
      setPremiumStatus("pending");
      setPremiumMsg("✅ Solicitud enviada. La revisaremos pronto.");
    } catch (e: any) {
      setPremiumMsg("❌ " + e.message);
    } finally {
      setPremiumEnviando(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Solo se permiten imagenes"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("La imagen no debe superar 5MB"); return; }
    setUploading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: uploadForm });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir imagen");
      setFormData(prev => ({ ...prev, image: data.url }));
    } catch (error: any) { alert(error.message); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(""); setSuccessMsg("");

    // Validaciones
    if (formData.name.trim().length < 2) { setErrorMsg("El nombre debe tener al menos 2 letras"); return; }
    if (formData.phone && formData.phone.length < 7) { setErrorMsg("El teléfono debe tener al menos 7 dígitos"); return; }
    if (formData.nequiNumber && formData.nequiNumber.length !== 10) { setErrorMsg("El número Nequi debe tener exactamente 10 dígitos"); return; }
    if (formData.phoneWhatsapp && formData.phoneWhatsapp.length < 7) { setErrorMsg("El WhatsApp debe tener al menos 7 dígitos"); return; }
    if (formData.antiPhishingCode && (formData.antiPhishingCode.length < 4 || formData.antiPhishingCode.length > 12)) { setErrorMsg("El código anti-phishing debe tener entre 4 y 12 caracteres"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Error al guardar"); }
      // Refresca la sesión para que la nueva foto aparezca en el header y la página principal
      await update();
      setSuccessMsg("¡Perfil actualizado correctamente!");
      setTimeout(() => router.push("/user/" + session?.user?.id), 1200);
    } catch (error: any) { setErrorMsg(error.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: "2rem" }}>Cargando...</div>;

  const lbl: React.CSSProperties = { display: "block", marginBottom: "0.4rem", fontWeight: 700, fontSize: "0.85rem", color: THEME.text };
  const box: React.CSSProperties = { marginBottom: "1.2rem" };
  const inp: React.CSSProperties = {
    width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
    border: "1.5px solid " + THEME.border, fontSize: "0.92rem",
    outline: "none", boxSizing: "border-box" as const,
    fontFamily: "inherit", background: "#ffffff", color: THEME.text,
  };
  const hint: React.CSSProperties = { fontSize: 11, color: THEME.muted, margin: "3px 0 0" };

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, color: THEME.text }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "18px 28px", boxShadow: "0 10px 30px rgba(10,46,107,0.2)" }}>
        <div style={{ maxWidth: 1200, margin: "auto" }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 42, width: "auto" }} />
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem 4rem" }}>
        <div style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: "2rem", boxShadow: THEME.cardShadow, border: "1.5px solid transparent" }}>
          <h2 style={{ color: THEME.text, marginTop: 0, textAlign: "center" }}>Editar perfil</h2>

          {successMsg && <div style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 10, padding: "0.7rem 1rem", marginBottom: "1rem", color: "#15803d", fontWeight: 700, fontSize: "0.9rem" }}>✅ {successMsg}</div>}
          {errorMsg  && <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: "0.7rem 1rem", marginBottom: "1rem", color: "#b91c1c", fontWeight: 700, fontSize: "0.9rem" }}>❌ {errorMsg}</div>}

          <form onSubmit={handleSubmit}>

            {/* ── DATOS PERSONALES ── */}
            <h3 style={{ color: THEME.gold, fontSize: 14, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Datos personales</h3>

            <div style={box}>
              <label style={lbl}>Nombre completo</label>
              <input style={inp} type="text" value={formData.name}
                onChange={e => setFormData({ ...formData, name: soloLetras(e.target.value) })}
                onKeyDown={e => { if (/[0-9!@#$%^&*()_+=\[\]{};':"\\|,.<>/?]/.test(e.key)) e.preventDefault(); }}
                placeholder="Ej: María García" maxLength={60} />
              <p style={hint}>Solo letras y espacios</p>
            </div>

            <div style={box}>
              <label style={lbl}>Teléfono</label>
              <PhoneInput value={formData.phone} onChange={v => setFormData({ ...formData, phone: v })} placeholder="3001234567" />
              <p style={hint}>Solo dígitos, sin el 0 ni el +57</p>
            </div>

            <div style={box}>
              <label style={lbl}>Ciudad</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inp, flex: 1 }} type="text" value={formData.city}
                  onChange={e => setFormData({ ...formData, city: soloLetras(e.target.value) })}
                  placeholder="Ej: Bogotá" maxLength={60} />
                <button type="button" onClick={detectarCiudad} disabled={geoLoading}
                  title="Detectar mi ubicación"
                  style={{ padding: "0 14px", borderRadius: 10, border: "1.5px solid " + THEME.border, background: geoLoading ? "#e2e8f0" : AZUL, color: "white", cursor: geoLoading ? "not-allowed" : "pointer", fontSize: 18, flexShrink: 0 }}>
                  {geoLoading ? "⏳" : "📍"}
                </button>
              </div>
              <p style={hint}>Solo letras · Toca 📍 para detectar tu ubicación</p>
              {geoErrorMsg && <p style={{ fontSize: 11.5, color: "#b91c1c", margin: "4px 0 0", fontWeight: 600 }}>⚠️ {geoErrorMsg}</p>}
            </div>

            {/* ── FOTO DE PERFIL ── */}
            <div style={box}>
              <label style={lbl}>Foto de perfil</label>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                {formData.image
                  ? <img src={formData.image} alt="Vista previa" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,205,0,0.5)" }} />
                  : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: "1.5rem" }}>{(formData.name || "?")[0]?.toUpperCase()}</div>
                }
                <div>
                  <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading}
                    style={{ padding: "8px", borderRadius: 8, border: "1px solid " + THEME.border, background: "white", fontSize: 13 }} />
                  {uploading && <p style={{ fontSize: 12, color: THEME.primary, margin: "4px 0 0" }}>⏳ Subiendo imagen...</p>}
                </div>
              </div>
            </div>

            {/* ── MÉTODOS DE PAGO ── */}
            <h3 style={{ color: THEME.gold, fontSize: 14, margin: "24px 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid " + THEME.border, paddingTop: 20, textAlign: "center" }}>Métodos de pago</h3>

            {/* NEQUI */}
            <div style={box}>
              <label style={lbl}>Número Nequi</label>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <div style={{ padding: "0.65rem 0.85rem", background: "#f3eeff", border: "1.5px solid #c4b5fd", borderRight: "none", borderRadius: "10px 0 0 10px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <img src="/logos/nequi.svg" alt="Nequi" style={{ height: 26, width: "auto", borderRadius: 6 }} />
                </div>
                <input style={{ ...inp, borderRadius: "0 10px 10px 0", flex: 1 }} type="tel" inputMode="numeric"
                  value={formData.nequiNumber}
                  onChange={e => setFormData({ ...formData, nequiNumber: soloNumeros(e.target.value) })}
                  onPaste={e => { e.preventDefault(); const p = soloNumeros(e.clipboardData.getData("text")).slice(0,10); setFormData(f => ({...f, nequiNumber: p})); }}
                  placeholder="3001234567" maxLength={10} />
              </div>
              <p style={hint}>10 dígitos exactos</p>
            </div>

            {/* BRE-B */}
            <div style={box}>
              <label style={lbl}>Llave Bre-B</label>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <div style={{ padding: "0.65rem 0.85rem", background: "#fff7e6", border: "1.5px solid #fbbf24", borderRight: "none", borderRadius: "10px 0 0 10px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <img src="/logos/breb.svg" alt="Bre-B" style={{ height: 26, width: "auto", borderRadius: 6 }} />
                </div>
                <input style={{ ...inp, borderRadius: "0 10px 10px 0", flex: 1 }} type="tel" inputMode="numeric"
                  value={formData.brebId}
                  onChange={e => setFormData({ ...formData, brebId: soloNumeros(e.target.value) })}
                  onPaste={e => { e.preventDefault(); const p = soloNumeros(e.clipboardData.getData("text")).slice(0,20); setFormData(f => ({...f, brebId: p})); }}
                  placeholder="Ej: 3001234567" maxLength={20} />
              </div>
              <p style={hint}>Solo dígitos</p>
            </div>

            {/* USDT */}
            <div style={box}>
              <label style={lbl}>Wallet USDT (dirección)</label>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <div style={{ padding: "0.65rem 0.85rem", background: "#f0fdf4", border: "1.5px solid #4ade80", borderRight: "none", borderRadius: "10px 0 0 10px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <img src="/logos/usdt.png" alt="USDT" style={{ width: 24, height: 24, borderRadius: "50%" }} />
                  <span style={{ fontWeight: 800, color: "#16a34a", fontSize: "0.85rem" }}>USDT</span>
                </div>
                <input style={{ ...inp, borderRadius: "0 10px 10px 0", flex: 1 }} type="text"
                  value={formData.usdtWallet}
                  onChange={e => setFormData({ ...formData, usdtWallet: e.target.value.replace(/\s/g, "") })}
                  placeholder="0x... o T..." maxLength={100} />
              </div>
              <p style={hint}>Dirección de tu billetera (sin espacios)</p>
            </div>

            {/* RED BLOCKCHAIN con logos */}
            <div style={box}>
              <label style={lbl}>Red blockchain</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { value: "BEP20",   name: "BNB Smart Chain", tag: "BEP20", bg: "#fffbeb", border: "#F3BA2F", textColor: "#92400e", img: "/logos/bnb.png" },
                  { value: "TRC20",   name: "Tron",            tag: "TRC20", bg: "#fef2f2", border: "#ef4444", textColor: "#991b1b", img: "/logos/tron.png" },
                  { value: "ERC20",   name: "Ethereum",        tag: "ERC20", bg: "#eef2ff", border: "#6366f1", textColor: "#3730a3", img: "/logos/eth.png" },
                  { value: "Polygon", name: "Polygon",         tag: "MATIC", bg: "#faf5ff", border: "#8B5CF6", textColor: "#5b21b6", img: "/logos/polygon.png" },
                ].map(net => (
                  <button key={net.value} type="button" onClick={() => setFormData({ ...formData, usdtRed: net.value })}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.7rem 0.9rem", borderRadius: 12, border: `2px solid ${formData.usdtRed === net.value ? net.border : THEME.border}`, background: formData.usdtRed === net.value ? net.bg : "#ffffff", cursor: "pointer", textAlign: "left", transition: "all 0.15s", boxShadow: formData.usdtRed === net.value ? `0 0 0 3px ${net.border}33` : "none" }}>
                    <img src={net.img} alt={net.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "0.82rem", color: formData.usdtRed === net.value ? net.textColor : THEME.text }}>{net.name}</div>
                      <div style={{ fontSize: "0.7rem", color: THEME.muted, fontWeight: 600 }}>{net.tag}</div>
                    </div>
                    {formData.usdtRed === net.value && <span style={{ marginLeft: "auto", color: net.textColor, fontSize: "1rem" }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ── ENVÍO ── */}
            <h3 style={{ color: THEME.gold, fontSize: 14, margin: "24px 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid " + THEME.border, paddingTop: 20, textAlign: "center" }}>Notificaciones y envío</h3>

            <div style={box}>
              <label style={lbl}>WhatsApp (para notificaciones)</label>
              <PhoneInput value={formData.phoneWhatsapp} onChange={v => setFormData({ ...formData, phoneWhatsapp: v })} placeholder="3001234567" />
              <p style={hint}>Recibirás notificaciones de ofertas, pagos y envíos</p>
            </div>

            <div style={box}>
              <label style={lbl}>Dirección de envío</label>
              <input style={inp} type="text"
                value={formData.direccionEnvio}
                onChange={e => setFormData({ ...formData, direccionEnvio: e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s\-\.,#]/g, "") })}
                placeholder="Calle 123 #45-67, Barrio, Ciudad" maxLength={200} />
              <p style={hint}>Letras, números, espacios, guiones y comas</p>
            </div>

            {/* ── SEGURIDAD ── */}
            <h3 style={{ color: THEME.gold, fontSize: 14, margin: "24px 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid " + THEME.border, paddingTop: 20, textAlign: "center" }}>Seguridad</h3>

            <div style={box}>
              <label style={lbl}>Código anti-phishing</label>
              <input style={{ ...inp, letterSpacing: "0.1em", fontWeight: 700 }} type="text"
                value={formData.antiPhishingCode}
                onChange={e => setFormData({ ...formData, antiPhishingCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })}
                placeholder="Ej: COLB2024" maxLength={12} />
              <p style={hint}>
                4 a 12 letras y números. Aparecerá en todos los correos que te enviemos.
                Si recibes un correo que dice ser de Colbisnes y <b>no muestra tu código</b>, desconfía: podría ser phishing.
              </p>
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
              <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
              <OutlineButton type="button" onClick={() => router.back()}>Cancelar</OutlineButton>
            </div>
          </form>

          {/* ── VERIFICACIÓN PREMIUM (badge, sin cobro) ── */}
          <h3 style={{ color: THEME.gold, fontSize: 14, margin: "28px 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid " + THEME.border, paddingTop: 20, textAlign: "center" }}>Verificación premium ⭐</h3>

          {premiumStatus === "approved" && (
            <p style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>✅ Ya tienes el badge de verificación premium en tu perfil.</p>
          )}
          {premiumStatus === "pending" && (
            <p style={{ fontSize: 13, color: THEME.primary, fontWeight: 700 }}>⏳ Tu solicitud está en revisión. Te avisaremos por correo.</p>
          )}
          {(premiumStatus === "none" || premiumStatus === "rejected") && (
            <div>
              <p style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5, margin: "0 0 14px" }}>
                Sube tu cédula y un comprobante de domicilio para obtener el badge de verificación premium — le da más confianza a tus compradores. No tiene costo.
                {premiumStatus === "rejected" && " Tu solicitud anterior no fue aprobada; puedes volver a intentarlo con fotos más claras."}
              </p>
              <div style={box}>
                <label style={lbl}>Foto de la cédula</label>
                <input type="file" accept="image/*" onChange={e => setPremiumCedula(e.target.files?.[0] || null)}
                  style={{ padding: "8px", borderRadius: 8, border: "1px solid " + THEME.border, background: "white", fontSize: 13 }} />
              </div>
              <div style={box}>
                <label style={lbl}>Comprobante de domicilio</label>
                <input type="file" accept="image/*" onChange={e => setPremiumComprobante(e.target.files?.[0] || null)}
                  style={{ padding: "8px", borderRadius: 8, border: "1px solid " + THEME.border, background: "white", fontSize: 13 }} />
              </div>
              {premiumMsg && <p style={{ fontSize: 12.5, fontWeight: 700, color: premiumMsg.startsWith("✅") ? "#15803d" : "#b91c1c", margin: "0 0 10px" }}>{premiumMsg}</p>}
              <OutlineButton type="button" onClick={solicitarPremium} disabled={premiumEnviando}>
                {premiumEnviando ? "Enviando..." : "Solicitar verificación premium"}
              </OutlineButton>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
