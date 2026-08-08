"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { THEME, CITIES, CATEGORIES } from "@/lib/theme";
import { Button, OutlineButton, Input, Select, TextArea } from "@/components/FormComponents";
import { useToast } from "@/components/Toast";
import { normalizarHeic, comprimirImagen } from "@/lib/imagen";
import {
  PIEZAS,
  categoriaPideDatosDeDispositivo,
  esImeiValido,
  normalizarSaludBateria,
  piezasALista,
  pisoDePrecio,
  mensajePisoDePrecio,
} from "@/lib/dispositivos";

const MAX_FOTOS = 10;

// Página de edición de una publicación. Reusa el mismo look del formulario de crear, pero
// aislada de la home (que es el flujo crítico de publicar) para no arriesgarlo. El backend
// (PATCH /api/products/[id]) vuelve a validar dueño + estado DISPONIBLE; aquí lo mostramos
// amable y bloqueamos antes de dejar editar.
export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const id = String((params as any)?.id || "");
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [meta, setMeta] = useState<{ sellerId: string; status: string } | null>(null);

  // Campos del formulario
  const [title, setTitle] = useState("");
  const [precioDisplay, setPrecioDisplay] = useState("");
  const [city, setCity] = useState<string>("Bogotá");
  const [category, setCategory] = useState<string>("Otros");
  const [condition, setCondition] = useState<string>("NUEVO");
  const [description, setDescription] = useState("");

  // Ficha del dispositivo (solo categoría Tecnologia)
  const [imei, setImei] = useState("");
  const [saludBateria, setSaludBateria] = useState("");
  const [piezas, setPiezas] = useState<string[]>([]);
  const esDispositivo = categoriaPideDatosDeDispositivo(category);
  const alternarPieza = (id: string) =>
    setPiezas((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  // Fotos: las que ya existen (URLs de Cloudinary) y las nuevas (aún archivos locales)
  const [imagenesExistentes, setImagenesExistentes] = useState<string[]>([]);
  const [nuevosArchivos, setNuevosArchivos] = useState<File[]>([]);
  const [nuevosPreviews, setNuevosPreviews] = useState<string[]>([]);
  const [procesandoFotos, setProcesandoFotos] = useState(false);

  // Cargar el producto y precargar el formulario
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/products/${id}`, { cache: "no-store", credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "No se pudo cargar la publicación");
        if (!vivo) return;
        setTitle(data.title || "");
        setPrecioDisplay(data.priceCOP ? Number(data.priceCOP).toLocaleString("es-CO") : "");
        setCity((CITIES as readonly string[]).includes(data.city) ? data.city : "Bogotá");
        setCategory(data.category || "Otros");
        setCondition(data.condition || "NUEVO");
        setDescription(data.description || "");
        setImagenesExistentes(((data.images || []) as any[]).map((im) => im.url).filter(Boolean));
        setMeta({ sellerId: data.sellerId, status: data.status });
        setSaludBateria(data.saludBateria != null ? String(data.saludBateria) : "");
        setPiezas(piezasALista(data.piezasReemplazadas));

        // GET /api/products/[id] ya no devuelve el IMEI completo (se enmascara para
        // no repartir números clonables). El dueño sí tiene derecho al suyo, así que
        // se pide aparte. Si esa llamada falla, se deja el parcial: el PATCH reconoce
        // el texto con puntos y entiende "no lo toques".
        if (data.tieneImei) {
          setImei(data.imeiParcial || "");
          try {
            const rImei = await fetch(`/api/products/${id}/imei`, { cache: "no-store", credentials: "include" });
            const dImei = await rImei.json().catch(() => ({}));
            if (vivo && rImei.ok && dImei?.imei) setImei(dImei.imei);
          } catch { /* se queda con el parcial */ }
        }
      } catch (e: any) {
        if (vivo) setErrorCarga(e.message || "Error al cargar");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [id]);

  const totalFotos = imagenesExistentes.length + nuevosArchivos.length;

  const agregarFotos = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const seleccion = Array.from(e.target.files || []);
    e.target.value = "";
    if (!seleccion.length) return;
    const espacio = MAX_FOTOS - (imagenesExistentes.length + nuevosArchivos.length);
    if (espacio <= 0) { showToast(`Máximo ${MAX_FOTOS} fotos`, "warning"); return; }
    setProcesandoFotos(true);
    try {
      const aProcesar = seleccion.slice(0, espacio);
      const procesados: File[] = [];
      const previews: string[] = [];
      for (let f of aProcesar) {
        // Misma normalización que al crear: HEIC de iPhone → JPEG y compresión para no
        // pasar el límite de 5MB del endpoint de subida.
        try { f = await normalizarHeic(f); } catch { /* sigue con el original */ }
        try { f = await comprimirImagen(f, f.size > 350 * 1024 ? 1600 : 2400); } catch { /* sigue igual */ }
        procesados.push(f);
        previews.push(URL.createObjectURL(f));
      }
      setNuevosArchivos((prev) => [...prev, ...procesados]);
      setNuevosPreviews((prev) => [...prev, ...previews]);
    } finally {
      setProcesandoFotos(false);
    }
  }, [imagenesExistentes.length, nuevosArchivos.length, showToast]);

  const quitarExistente = (url: string) => setImagenesExistentes((prev) => prev.filter((u) => u !== url));
  const quitarNueva = (idx: number) => {
    setNuevosPreviews((prev) => { try { URL.revokeObjectURL(prev[idx]); } catch {} return prev.filter((_, i) => i !== idx); });
    setNuevosArchivos((prev) => prev.filter((_, i) => i !== idx));
  };

  const guardar = async () => {
    const priceCOP = parseInt(precioDisplay.replace(/\./g, "").replace(/,/g, "")) || 0;
    if (title.trim().length < 3) { showToast("El título debe tener al menos 3 caracteres", "warning"); return; }
    if (description.trim().length < 10) { showToast("La descripción debe tener al menos 10 caracteres", "warning"); return; }
    if (!category) { showToast("Selecciona una categoría", "warning"); return; }
    // El piso depende de la categoría, igual que al publicar. Sin esto, editar era el
    // atajo para dejar un carro en $1 después de haberlo publicado en su precio real.
    const piso = pisoDePrecio(category);
    if (priceCOP < piso) { showToast(mensajePisoDePrecio(category, piso), "warning"); return; }
    if (esDispositivo) {
      // El parcial (con •) significa "no lo cambié"; el servidor lo entiende así.
      const imeiTocado = imei.trim() !== "" && !imei.includes("•");
      if (imeiTocado && !esImeiValido(imei)) {
        showToast("Ese IMEI no es válido. Son 15 dígitos: márcalos con *#06#", "warning"); return;
      }
      if (saludBateria.trim() !== "" && normalizarSaludBateria(saludBateria) === null) {
        showToast("La salud de la batería debe ser un número entre 1 y 100", "warning"); return;
      }
    }

    setGuardando(true);
    try {
      // Subir las fotos nuevas (una por una, igual que al crear)
      const nuevasUrls: string[] = [];
      for (const file of nuevosArchivos) {
        const fd = new FormData();
        fd.append("images", file);
        const upRes = await fetch("/api/upload-images", { method: "POST", credentials: "include", body: fd });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new Error(upData?.error || `No se pudo subir la foto "${file.name}"`);
        if (upData?.urls?.length) nuevasUrls.push(upData.urls[0]);
      }
      const images = [...imagenesExistentes, ...nuevasUrls];

      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(), description: description.trim(), priceCOP, city, condition, category, images,
          imei: esDispositivo ? imei.trim() : "",
          saludBateria: esDispositivo ? saludBateria.trim() : "",
          piezasReemplazadas: esDispositivo ? piezas : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar la publicación");
      showToast("Publicación actualizada ✅", "success");
      router.push(`/product/${id}`);
    } catch (e: any) {
      showToast(e.message || "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  };

  // ---- Estados de bloqueo / carga ----
  const wrap = (children: React.ReactNode) => (
    <main style={{ maxWidth: 640, margin: "auto", padding: "24px 16px 60px" }}>
      <Link href="/" style={{ color: THEME.primary, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>← Volver</Link>
      <div style={{ marginTop: 16 }}>{children}</div>
    </main>
  );

  if (sessionStatus === "unauthenticated") {
    return wrap(
      <div style={{ background: THEME.surfaceGradient, borderRadius: 16, padding: 24, boxShadow: THEME.cardShadow, textAlign: "center" }}>
        <p style={{ color: THEME.text, fontWeight: 700, margin: "0 0 12px" }}>Inicia sesión para editar tu publicación.</p>
        <Link href="/auth/login"><Button type="button">Iniciar sesión</Button></Link>
      </div>
    );
  }

  if (cargando || sessionStatus === "loading") {
    return wrap(<p style={{ color: THEME.muted, textAlign: "center" }}>Cargando publicación…</p>);
  }

  if (errorCarga) {
    return wrap(
      <div style={{ background: THEME.surfaceGradient, borderRadius: 16, padding: 24, boxShadow: THEME.cardShadow, textAlign: "center" }}>
        <p style={{ color: "#b91c1c", fontWeight: 700, margin: 0 }}>{errorCarga}</p>
      </div>
    );
  }

  // Candados: solo el dueño y solo mientras esté DISPONIBLE
  if (meta && session?.user?.id && meta.sellerId !== session.user.id) {
    return wrap(
      <div style={{ background: THEME.surfaceGradient, borderRadius: 16, padding: 24, boxShadow: THEME.cardShadow, textAlign: "center" }}>
        <p style={{ color: THEME.text, fontWeight: 700, margin: 0 }}>Esta publicación no es tuya, no puedes editarla.</p>
      </div>
    );
  }
  if (meta && meta.status !== "AVAILABLE") {
    return wrap(
      <div style={{ background: THEME.surfaceGradient, borderRadius: 16, padding: 24, boxShadow: THEME.cardShadow, textAlign: "center" }}>
        <p style={{ color: THEME.text, fontWeight: 700, margin: "0 0 6px" }}>Esta publicación ya tiene una venta en curso.</p>
        <p style={{ color: THEME.muted, fontSize: 13, margin: "0 0 14px" }}>Solo se puede editar mientras esté disponible, para no cambiar lo que un comprador ya pactó o pagó.</p>
        <Link href={`/product/${id}`}><OutlineButton type="button">Ver publicación</OutlineButton></Link>
      </div>
    );
  }

  // ---- Formulario ----
  return wrap(
    <div style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: "24px 20px", boxShadow: THEME.cardShadow, scrollMarginTop: 80 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, color: THEME.text, margin: "0 0 18px", textAlign: "center" }}>Editar publicación</h1>
      <div style={{ display: "grid", gap: 12 }}>
        <Input
          placeholder="Título del producto *"
          spellCheck
          lang="es"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            const nav = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(e.key);
            if (ctrl || nav) return;
            if (e.key.length === 1 && !/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s\-',.()0-9]/.test(e.key)) e.preventDefault();
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input
            placeholder="Precio COP *"
            type="text"
            inputMode="numeric"
            value={precioDisplay}
            onChange={(e) => {
              const raw = e.target.value.replace(/\./g, "").replace(/,/g, "");
              const num = parseInt(raw) || 0;
              setPrecioDisplay(num > 0 ? num.toLocaleString("es-CO") : "");
            }}
            onKeyDown={(e) => {
              const nav = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(e.key);
              if (nav) return;
              if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
            }}
          />
          <Select value={city} onChange={(e) => setCity(e.target.value)}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </Select>
          <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="NUEVO">Nuevo</option>
            <option value="USADO">Usado</option>
            <option value="REACONDICIONADO">Reacondicionado</option>
          </Select>
        </div>

        {/* Misma ficha que en el formulario de publicar. Ver app/page.tsx. */}
        {esDispositivo && (
          <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, padding: "14px 14px 12px", background: THEME.surfaceAlt }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: THEME.primaryDark }}>
              Datos del equipo <span style={{ fontWeight: 500, color: THEME.muted }}>(opcional)</span>
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <div>
                <Input
                  placeholder="IMEI (15 dígitos, márcalo con *#06#)"
                  type="text"
                  inputMode="numeric"
                  maxLength={20}
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                />
                <p style={{ fontSize: 11, color: THEME.muted, margin: "4px 0 0", lineHeight: 1.4 }}>
                  En la publicación se ve solo una parte. El número completo se lo damos
                  únicamente a compradores con identidad verificada.
                </p>
              </div>
              <Input
                placeholder="Salud de la batería, % (ej: 87)"
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={saludBateria}
                onChange={(e) => setSaludBateria(e.target.value.replace(/\D/g, ""))}
              />
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, margin: "2px 0 6px", color: THEME.text }}>Piezas reemplazadas</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PIEZAS.map((p) => (
                    <label key={p.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 999, padding: "5px 11px", cursor: "pointer" }}>
                      <input type="checkbox" checked={piezas.includes(p.id)} onChange={() => alternarPieza(p.id)} style={{ margin: 0, cursor: "pointer" }} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <TextArea
          placeholder="Descripción detallada *"
          rows={4}
          spellCheck
          lang="es"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px", color: THEME.text }}>
            Fotos del producto ({totalFotos}/{MAX_FOTOS})
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {imagenesExistentes.map((url) => (
              <div key={url} style={{ position: "relative", width: 86, height: 86, borderRadius: 12, overflow: "hidden", border: `2px solid ${THEME.gold}` }}>
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button type="button" onClick={() => quitarExistente(url)} aria-label="Quitar foto"
                  style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(239,68,68,0.92)", border: "none", color: "white", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>×</button>
              </div>
            ))}
            {nuevosPreviews.map((src, idx) => (
              <div key={src} style={{ position: "relative", width: 86, height: 86, borderRadius: 12, overflow: "hidden", border: `2px dashed ${THEME.gold}` }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button type="button" onClick={() => quitarNueva(idx)} aria-label="Quitar foto nueva"
                  style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(239,68,68,0.92)", border: "none", color: "white", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>×</button>
              </div>
            ))}
            {totalFotos < MAX_FOTOS && (
              <label style={{ width: 86, height: 86, borderRadius: 12, border: `2px dashed ${THEME.border}`, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: procesandoFotos ? "wait" : "pointer" }}>
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={agregarFotos} disabled={procesandoFotos} />
                <span style={{ fontSize: 24, color: THEME.muted }}>{procesandoFotos ? "…" : "+"}</span>
              </label>
            )}
          </div>
          <p style={{ fontSize: 11, color: THEME.muted, margin: "6px 0 0" }}>Toca + para agregar · × para eliminar</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Button type="button" onClick={guardar} disabled={guardando || procesandoFotos}>
          {guardando ? "Guardando…" : procesandoFotos ? "Procesando fotos…" : "Guardar cambios"}
        </Button>
        <OutlineButton type="button" onClick={() => router.push(`/product/${id}`)}>Cancelar</OutlineButton>
      </div>
    </div>
  );
}
