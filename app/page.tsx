"use client";

import React, { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  title: string;
  description: string;
  priceCOP: number;
  city: string;
  status?: string; // AVAILABLE | PAYMENT_PENDING | RESERVED | SOLD (según DB)
  createdAt: string;
  acceptedOfferId?: string | null;
  paymentExpiresAt?: string | number | null; // OJO: puede venir number (ms) o string
  paidAt?: string | null;
  soldAt?: string | null;
};

type Offer = {
  id: string;
  productId: string;
  amountCOP: number;
  message?: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
};

function moneyCOP(n: number) {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$ ${Math.round(n).toString()}`;
  }
}

// ✅ Temporizador correcto: TODO en milisegundos
function calcularTiempoRestante(expiraEn: string | number | null | undefined) {
  if (expiraEn === null || expiraEn === undefined) return null;

  const expMs =
    typeof expiraEn === "number"
      ? expiraEn
      : Number(expiraEn);

  if (!expMs || Number.isNaN(expMs)) return null;

  const ahora = Date.now();
  const diferencia = expMs - ahora;

  if (diferencia <= 0) return "00:00";

  const minutos = Math.floor(diferencia / 60000);
  const segundos = Math.floor((diferencia % 60000) / 1000);

  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

function etiquetaEstado(estado?: string) {
  switch (estado) {
    case "AVAILABLE":
      return "DISPONIBLE";
    case "PAYMENT_PENDING":
      return "PAGO EN PROCESO";
    case "RESERVED":
      return "RESERVADO";
    case "SOLD":
      return "VENDIDO";
    default:
      return "DISPONIBLE";
  }
}

function etiquetaEstadoOferta(estado: Offer["status"]) {
  switch (estado) {
    case "PENDING":
      return "PENDIENTE";
    case "ACCEPTED":
      return "ACEPTADA";
    case "REJECTED":
      return "RECHAZADA";
  }
}

export default function Page() {
  // Form publicar
  const [title, setTitle] = useState("");
  const [priceCOP, setPriceCOP] = useState<string>("");
  const [city, setCity] = useState("Bogotá");
  const [description, setDescription] = useState("");

  // Productos
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Ofertas (por producto seleccionado)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  // Form oferta
  const [offerAmount, setOfferAmount] = useState<string>("");
  const [offerMessage, setOfferMessage] = useState<string>("");

  // ✅ Para que el temporizador actualice cada segundo
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  async function fetchProducts() {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/products -> ${res.status}`);
      const data = (await res.json()) as Product[];
      setProducts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error(e);
      alert("Error cargando productos. Mira la consola/terminal.");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function fetchOffers(productId: string) {
    setLoadingOffers(true);
    try {
      const res = await fetch(`/api/offers?productId=${encodeURIComponent(productId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`GET /api/offers -> ${res.status} ${txt}`);
      }
      const data = (await res.json()) as Offer[];
      setOffers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error(e);
      alert("Error cargando ofertas. Mira la consola/terminal.");
    } finally {
      setLoadingOffers(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  // Si seleccionas un producto, cargamos sus ofertas
  useEffect(() => {
    if (selectedProductId) fetchOffers(selectedProductId);
    else setOffers([]);
  }, [selectedProductId]);

  async function onPublish() {
    const p = Number(priceCOP);
    if (!title.trim() || !description.trim() || !city.trim() || !Number.isFinite(p) || p <= 0) {
      alert("Completa título, ciudad, descripción y un precio válido.");
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priceCOP: p,
          city: city.trim(),
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`POST /api/products -> ${res.status} ${txt}`);
      }

      setTitle("");
      setPriceCOP("");
      setDescription("");

      await fetchProducts();
    } catch (e: any) {
      console.error(e);
      alert("No se pudo publicar el producto. Mira la consola/terminal.");
    } finally {
      setPublishing(false);
    }
  }

  async function onMakeOffer(productId: string) {
    const a = Number(offerAmount);
    if (!Number.isFinite(a) || a <= 0) {
      alert("Pon un valor de oferta válido.");
      return;
    }

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          amountCOP: a,
          message: offerMessage.trim() ? offerMessage.trim() : null,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`POST /api/offers -> ${res.status} ${txt}`);
      }

      setOfferAmount("");
      setOfferMessage("");

      await fetchOffers(productId);
    } catch (e: any) {
      console.error(e);
      alert("No se pudo crear la oferta. Mira consola/terminal.");
    }
  }

  async function onUpdateOffer(offerId: string, status: "ACCEPTED" | "REJECTED") {
    try {
      const res = await fetch("/api/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, status }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`PATCH /api/offers -> ${res.status} ${txt}`);
      }

      if (selectedProductId) {
        await fetchOffers(selectedProductId);
        await fetchProducts();
      }
    } catch (e: any) {
      console.error(e);
      alert("No se pudo actualizar la oferta. Mira consola/terminal.");
    }
  }

  // Comprar ahora: por ahora solo UI (como lo tenías)
  function onBuyNow(product: Product) {
    alert(
      "Comprar ahora está listo en la interfaz ✅\n" +
        "Siguiente paso: conectarlo al flujo de pago real.\n" +
        "Por ahora solo reservamos tiempo cuando se acepta una oferta."
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 6 }}>colbisnes</h1>
        <div style={{ opacity: 0.7, marginBottom: 18 }}>Compra · Vende · Negocia (Colombia)</div>

        {/* Publicar */}
        <section
          style={{
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 14,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Publicar producto</h2>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="¿Qué vendes? Ej: Licuadora, Bicicleta..."
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.2)",
              background: "transparent",
              color: "inherit",
            }}
          />

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <input
              value={priceCOP}
              onChange={(e) => setPriceCOP(e.target.value)}
              placeholder="Precio (COP)"
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.2)",
                background: "transparent",
                color: "inherit",
              }}
            />

            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{
                width: 180,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.2)",
                background: "transparent",
                color: "inherit",
              }}
            >
              <option>Bogotá</option>
              <option>Medellín</option>
              <option>Cali</option>
              <option>Barranquilla</option>
              <option>Cartagena</option>
            </select>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (mínimo 10 caracteres)..."
            rows={4}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.2)",
              background: "transparent",
              color: "inherit",
              marginTop: 12,
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={onPublish}
              disabled={publishing}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.25)",
                background: publishing ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.12)",
                color: "inherit",
                cursor: publishing ? "not-allowed" : "pointer",
              }}
            >
              {publishing ? "Publicando..." : "Publicar"}
            </button>

            <button
              onClick={fetchProducts}
              disabled={loadingProducts}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.25)",
                background: loadingProducts ? "rgba(255,255,255,.08)" : "transparent",
                color: "inherit",
                cursor: loadingProducts ? "not-allowed" : "pointer",
              }}
            >
              {loadingProducts ? "Cargando..." : "Recargar lista"}
            </button>
          </div>
        </section>

        {/* Lista productos */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ marginTop: 0 }}>Productos</h2>
            <div style={{ opacity: 0.7 }}>{products.length} publicados</div>
          </div>

          {products.length === 0 ? (
            <div
              style={{
                opacity: 0.75,
                padding: 14,
                border: "1px dashed rgba(255,255,255,.25)",
                borderRadius: 12,
              }}
            >
              No hay productos aún. Publica uno arriba ☝️
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {products.map((p) => {
                const estado = etiquetaEstado(p.status);
                const enPago = p.status === "PAYMENT_PENDING";
                const tiempo = enPago ? calcularTiempoRestante(p.paymentExpiresAt ?? null) : null;

                return (
                  <div key={p.id} style={{ border: "1px solid rgba(255,255,255,.15)", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{p.title}</div>
                        <div style={{ opacity: 0.8, marginTop: 4 }}>{p.city}</div>
                        <div style={{ opacity: 0.8, marginTop: 4 }}>
                          Estado: <b>{estado}</b>
                        </div>

                        {/* ✅ Caja de “otro usuario pagando” */}
                        {enPago && tiempo && tiempo !== "00:00" ? (
                          <div
                            style={{
                              marginTop: 10,
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,.25)",
                              background: "rgba(255,255,255,.06)",
                              maxWidth: 360,
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>Otro usuario está realizando el pago</div>
                            <div style={{ opacity: 0.9, marginTop: 6 }}>
                              Tiempo disponible: <b>{tiempo}</b>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div style={{ fontWeight: 800, fontSize: 18 }}>{moneyCOP(p.priceCOP)}</div>
                    </div>

                    <div style={{ opacity: 0.85, marginTop: 10 }}>{p.description}</div>

                    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      <button
                        onClick={() => onBuyNow(p)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,.25)",
                          background: "rgba(255,255,255,.10)",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        Comprar ahora
                      </button>

                      <button
                        onClick={() => setSelectedProductId(p.id)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,.25)",
                          background: selectedProductId === p.id ? "rgba(255,255,255,.18)" : "transparent",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {selectedProductId === p.id ? "Ofertas abiertas" : "Hacer oferta"}
                      </button>
                    </div>

                    {/* Panel ofertas */}
                    {selectedProductId === p.id && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,.2)" }}>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>Enviar oferta</div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <input
                            value={offerAmount}
                            onChange={(e) => setOfferAmount(e.target.value)}
                            placeholder="Oferta en COP (ej: 10000)"
                            style={{
                              flex: 1,
                              minWidth: 220,
                              padding: 12,
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,.2)",
                              background: "transparent",
                              color: "inherit",
                            }}
                          />

                          <button
                            onClick={() => onMakeOffer(p.id)}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,.25)",
                              background: "rgba(255,255,255,.12)",
                              color: "inherit",
                              cursor: "pointer",
                            }}
                          >
                            Enviar oferta
                          </button>
                        </div>

                        <textarea
                          value={offerMessage}
                          onChange={(e) => setOfferMessage(e.target.value)}
                          placeholder="Mensaje (opcional)"
                          rows={2}
                          style={{
                            width: "100%",
                            padding: 12,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,.2)",
                            background: "transparent",
                            color: "inherit",
                            marginTop: 10,
                          }}
                        />

                        <div style={{ fontWeight: 700, marginTop: 16, marginBottom: 10 }}>
                          Ofertas {loadingOffers ? "(cargando...)" : ""}
                        </div>

                        {offers.length === 0 ? (
                          <div style={{ opacity: 0.75 }}>Aún no hay ofertas.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {offers.map((o) => (
                              <div
                                key={o.id}
                                style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 12 }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                                  <div style={{ fontWeight: 800 }}>{moneyCOP(o.amountCOP)}</div>
                                  <div style={{ opacity: 0.8 }}>{etiquetaEstadoOferta(o.status)}</div>
                                </div>

                                {o.message ? <div style={{ opacity: 0.9, marginTop: 6 }}>{o.message}</div> : null}

                                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                                  <button
                                    onClick={() => onUpdateOffer(o.id, "ACCEPTED")}
                                    disabled={o.status !== "PENDING"}
                                    style={{
                                      padding: "8px 12px",
                                      borderRadius: 10,
                                      border: "1px solid rgba(255,255,255,.25)",
                                      background: o.status === "PENDING" ? "rgba(0,255,0,.18)" : "rgba(255,255,255,.05)",
                                      color: "inherit",
                                      cursor: o.status === "PENDING" ? "pointer" : "not-allowed",
                                    }}
                                  >
                                    Aceptar
                                  </button>

                                  <button
                                    onClick={() => onUpdateOffer(o.id, "REJECTED")}
                                    disabled={o.status !== "PENDING"}
                                    style={{
                                      padding: "8px 12px",
                                      borderRadius: 10,
                                      border: "1px solid rgba(255,255,255,.25)",
                                      background: o.status === "PENDING" ? "rgba(255,0,0,.18)" : "rgba(255,255,255,.05)",
                                      color: "inherit",
                                      cursor: o.status === "PENDING" ? "pointer" : "not-allowed",
                                    }}
                                  >
                                    Rechazar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={() => setSelectedProductId(null)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,.25)",
                              background: "transparent",
                              color: "inherit",
                              cursor: "pointer",
                            }}
                          >
                            Cerrar ofertas
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}