"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { THEME, CITIES, CATEGORIES } from "@/lib/theme";
import { Button, OutlineButton, Input, Select, TextArea } from "@/components/FormComponents";
import { useToast } from "@/components/Toast";
import { esCuentaMaster } from "@/lib/adminAuth";
import { normalizarHeic, comprimirImagen } from "@/lib/imagen";
import {
  PIEZAS,
  categoriaPideDatosDeDispositivo,
  esImeiValido,
  normalizarImei,
  avisoDigitoDeControl,
  normalizarSaludBateria,
  piezasALista,
  pisoDePrecio,
  mensajePisoDePrecio,
} from "@/lib/dispositivos";
import {
  TIPOS_ENTREGA,
  ETIQUETAS_ENTREGA,
  permiteCostoFijoDeEnvio,
  PISO_PRECIO_ENVIO,
  TECHO_PRECIO_ENVIO,
} from "@/lib/entrega";

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
  // Perfil MASTER (ver lib/adminAuth.ts): puede editar CUALQUIER publicación, sea de quien sea
  // y esté en el estado que esté — el backend (PATCH /api/products/[id]) ya lo permite desde
  // que existe el rol master; estos dos candados de abajo eran solo de cara al usuario normal
  // y sin este bypass client-side el master nunca llegaba a ver el formulario.
  const esMaster = esCuentaMaster(session);

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

  // Cómo se entrega. Aquí importa más que al publicar: los productos que ya
  // existen nacieron todos con "ENVIO" puesto por el schema sin que nadie lo
  // eligiera, y esta pantalla es el único sitio donde su dueño puede corregirlo.
  const [tipoEntrega, setTipoEntrega] = useState<string>("");
  const [modoEnvio, setModoEnvio] = useState<"COORDINAR" | "FIJO">("COORDINAR");
  const [envioDisplay, setEnvioDisplay] = useState("");

  // Ficha del dispositivo (solo categoría Tecnologia)
  const [imei, setImei] = useState("");
  const [imei2, setImei2] = useState("");
  const [saludBateria, setSaludBateria] = useState("");
  const [piezas, setPiezas] = useState<string[]>([]);
  const esDispositivo = categoriaPideDatosDeDispositivo(category);
  // Aviso, no bloqueo: el número tiene sus 15 dígitos pero no cuadra con su dígito de
  // control. Casi siempre es un dígito mal copiado, pero hay equipos reales así, y como
  // aquí no se consulta ninguna base de datos, nadie puede afirmar que esté mal.
  // El valor enmascarado (con •) no se revisa: el navegador no conoce el número real.
  const avisoImei1 = normalizarImei(imei) !== null && !esImeiValido(imei) ? avisoDigitoDeControl("IMEI 1") : null;
  const avisoImei2 = normalizarImei(imei2) !== null && !esImeiValido(imei2) ? avisoDigitoDeControl("IMEI 2") : null;
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
        // precioEnvio null es un valor con significado ("lo coordino por el chat"),
        // no un campo vacío. Por eso se mira el número y no si viene o no viene.
        setTipoEntrega((TIPOS_ENTREGA as readonly string[]).includes(data.tipoEntrega) ? data.tipoEntrega : "");
        if (typeof data.precioEnvio === "number" && data.precioEnvio > 0) {
          setModoEnvio("FIJO");
          setEnvioDisplay(Number(data.precioEnvio).toLocaleString("es-CO"));
        } else {
          setModoEnvio("COORDINAR");
          setEnvioDisplay("");
        }
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
          setImei2(data.imei2Parcial || "");
          try {
            const rImei = await fetch(`/api/products/${id}/imei`, { cache: "no-store", credentials: "include" });
            const dImei = await rImei.json().catch(() => ({}));
            if (vivo && rImei.ok && dImei?.imei) {
              setImei(dImei.imei);
              setImei2(dImei.imei2 || "");
            }
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

    // Las mismas reglas de lib/entrega.ts, adelantadas aquí solo para avisar bonito.
    // Quien manda sigue siendo el servidor: si esto se saltara, PATCH lo rechaza igual.
    if (!(TIPOS_ENTREGA as readonly string[]).includes(tipoEntrega)) {
      showToast("Dinos cómo entregas el producto: por envío, en persona, o las dos.", "warning"); return;
    }
    const cobraEnvio = permiteCostoFijoDeEnvio(tipoEntrega) && modoEnvio === "FIJO";
    const precioEnvio = cobraEnvio
      ? (parseInt(envioDisplay.replace(/\./g, "").replace(/,/g, "")) || 0)
      : null;
    if (cobraEnvio) {
      if (!precioEnvio) { showToast("Escribe cuánto cuesta el envío.", "warning"); return; }
      if (precioEnvio < PISO_PRECIO_ENVIO) {
        showToast(`El costo del envío no puede ser menor a $${PISO_PRECIO_ENVIO.toLocaleString("es-CO")}. Si prefieres no fijarlo, escoge "lo coordino con el comprador".`, "warning"); return;
      }
      if (precioEnvio > TECHO_PRECIO_ENVIO) {
        showToast(`El costo del envío no puede superar $${TECHO_PRECIO_ENVIO.toLocaleString("es-CO")}. Revisa que no te haya sobrado un cero.`, "warning"); return;
      }
    }
    if (esDispositivo) {
      // El parcial (con •) significa "no lo cambié"; el servidor lo entiende así.
      const tocado = (v: string) => v.trim() !== "" && !v.includes("•");
      // Lo único que bloquea es que no sean 15 dígitos. El dígito de control NO bloquea:
      // existen equipos reales cuyo IMEI no cuadra con él, y Colbisnes no consulta ninguna
      // base de datos, así que una cuenta hecha en el navegador no puede vetar una venta.
      // Cuando falla se muestra el aviso ámbar debajo de la casilla, y ya.
      if (tocado(imei) && normalizarImei(imei) === null) {
        showToast("El IMEI 1 son 15 dígitos: márcalos con *#06# y cópialos tal cual.", "warning"); return;
      }
      if (tocado(imei2) && normalizarImei(imei2) === null) {
        showToast("El IMEI 2 son 15 dígitos: márcalos con *#06# y cópialos tal cual.", "warning"); return;
      }
      // Las mismas dos revisiones del par que en el servidor. Solo tienen sentido
      // cuando los dos valores están a la vista; si alguno sigue enmascarado, el
      // navegador no conoce el número real y quien decide es el servidor.
      if (tocado(imei) && tocado(imei2) && normalizarImei(imei) === normalizarImei(imei2)) {
        showToast("Los dos IMEI son el mismo número. En un equipo de dos SIM son distintos.", "warning"); return;
      }
      if (imei.trim() === "" && tocado(imei2)) {
        showToast("Escribe primero el IMEI 1. Si el equipo tiene uno solo, va en esa casilla.", "warning"); return;
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
          tipoEntrega, precioEnvio,
          imei: esDispositivo ? imei.trim() : "",
          imei2: esDispositivo ? imei2.trim() : "",
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

  // Candados: solo el dueño y solo mientras esté DISPONIBLE — salvo el perfil MASTER, que
  // los salta por diseño (ver esMaster arriba).
  if (meta && session?.user?.id && meta.sellerId !== session.user.id && !esMaster) {
    return wrap(
      <div style={{ background: THEME.surfaceGradient, borderRadius: 16, padding: 24, boxShadow: THEME.cardShadow, textAlign: "center" }}>
        <p style={{ color: THEME.text, fontWeight: 700, margin: 0 }}>Esta publicación no es tuya, no puedes editarla.</p>
      </div>
    );
  }
  if (meta && meta.status !== "AVAILABLE" && !esMaster) {
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
      {esMaster && meta && meta.sellerId !== session?.user?.id && (
        <p style={{ background: "#fff7e6", color: "#92660a", fontSize: 12.5, fontWeight: 700, padding: "8px 12px", borderRadius: 10, margin: "0 0 14px", textAlign: "center" }}>
          ⚠️ Estás editando la publicación de otro vendedor como perfil master{meta.status !== "AVAILABLE" ? ` (estado actual: ${meta.status})` : ""}.
        </p>
      )}
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

        {/* Mismas dos preguntas que al publicar. Ver app/page.tsx. */}
        <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, padding: "14px 14px 12px", background: THEME.surfaceAlt }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: THEME.primaryDark }}>¿Cómo lo entregas? *</p>
          <p style={{ margin: "4px 0 12px", fontSize: 11.5, color: THEME.muted, lineHeight: 1.45 }}>
            Esto es lo que ve el comprador antes de pagar. Si solo lo entregas en
            persona, no se le pide dirección ni se le cobra envío.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            <Select value={tipoEntrega} onChange={(e) => setTipoEntrega(e.target.value)}>
              <option value="">Escoge una opción…</option>
              {TIPOS_ENTREGA.map((t) => <option key={t} value={t}>{ETIQUETAS_ENTREGA[t]}</option>)}
            </Select>

            {tipoEntrega === "AMBOS" && (
              <p style={{ margin: 0, fontSize: 11.5, color: THEME.muted, lineHeight: 1.45 }}>
                El costo del envío lo acuerdas por el chat. Como el comprador puede
                escoger recogerlo, no se le puede cobrar un flete fijo por adelantado.
                Si quieres cobrar un valor fijo, escoge "solo envío".
              </p>
            )}

            {permiteCostoFijoDeEnvio(tipoEntrega) && (
              <>
                <Select value={modoEnvio} onChange={(e) => setModoEnvio(e.target.value as "COORDINAR" | "FIJO")}>
                  <option value="COORDINAR">El envío lo coordino con el comprador por el chat</option>
                  <option value="FIJO">Cobro un valor fijo por el envío</option>
                </Select>

                {modoEnvio === "FIJO" && (
                  <div>
                    <Input
                      placeholder="Cuánto cuesta el envío (COP) *"
                      type="text"
                      inputMode="numeric"
                      value={envioDisplay}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, "").replace(/,/g, "");
                        const num = parseInt(raw) || 0;
                        setEnvioDisplay(num > 0 ? num.toLocaleString("es-CO") : "");
                      }}
                      onKeyDown={(e) => {
                        const nav = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(e.key);
                        if (nav) return;
                        if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
                      }}
                    />
                    <p style={{ margin: "4px 0 0", fontSize: 11.5, color: THEME.muted, lineHeight: 1.45 }}>
                      Entre ${PISO_PRECIO_ENVIO.toLocaleString("es-CO")} y ${TECHO_PRECIO_ENVIO.toLocaleString("es-CO")}.
                      Al comprador se le suma aparte del precio, con un 10% de manejo.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Misma ficha que en el formulario de publicar. Ver app/page.tsx. */}
        {esDispositivo && (
          <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, padding: "14px 14px 12px", background: THEME.surfaceAlt }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: THEME.primaryDark }}>
              Datos del equipo <span style={{ fontWeight: 500, color: THEME.muted }}>(opcional)</span>
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: THEME.primaryDark, margin: "0 0 4px" }}>
                    IMEI 1
                  </label>
                  <Input
                    placeholder="15 dígitos (*#06#)"
                    type="text"
                    inputMode="numeric"
                    maxLength={20}
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                  />
                  {avisoImei1 && (
                    <p style={{ color: "#9a5b00", fontSize: 11.5, margin: "4px 0 0", lineHeight: 1.4 }}>{avisoImei1}</p>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: THEME.primaryDark, margin: "0 0 4px" }}>
                    IMEI 2 <span style={{ fontWeight: 500, color: THEME.muted }}>(si tiene dos SIM)</span>
                  </label>
                  <Input
                    placeholder="15 dígitos"
                    type="text"
                    inputMode="numeric"
                    maxLength={20}
                    value={imei2}
                    onChange={(e) => setImei2(e.target.value)}
                  />
                  {avisoImei2 && (
                    <p style={{ color: "#9a5b00", fontSize: 11.5, margin: "4px 0 0", lineHeight: 1.4 }}>{avisoImei2}</p>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 11, color: THEME.muted, margin: "-2px 0 0", lineHeight: 1.4 }}>
                En la publicación se ve solo una parte. Los números completos se los entregamos
                únicamente a tu comprador, cuando ya haya reservado o pagado el equipo.
              </p>
              <div>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: THEME.primaryDark, margin: "0 0 4px" }}>
                  Salud de la batería <span style={{ fontWeight: 500, color: THEME.muted }}>(porcentaje)</span>
                </label>
                {/* Mismo tratamiento que en el formulario de publicar: el % queda dentro
                    de la casilla para que no se pierda al escribir. Ver app/page.tsx. */}
                <div style={{ position: "relative" }}>
                  <Input
                    placeholder="Ej: 87"
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={saludBateria}
                    onChange={(e) => setSaludBateria(e.target.value.replace(/\D/g, ""))}
                    style={{ paddingRight: 36 }}
                  />
                  <span style={{ position: "absolute", right: 13, top: 0, height: "100%", display: "flex", alignItems: "center", fontSize: "0.95rem", fontWeight: 600, color: THEME.muted, pointerEvents: "none" }}>
                    %
                  </span>
                </div>
              </div>
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
