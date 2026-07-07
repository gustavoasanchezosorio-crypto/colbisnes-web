"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, OutlineButton } from "@/components/FormComponents";
import TrustBadge from "@/components/TrustBadge";
import { THEME } from "@/lib/theme";
import { formatMoney } from "@/lib/utils";

const AZUL = THEME.primary;
const DORADO = THEME.gold;

type UserProfile = {
  id: string;
  name: string | null;
  city: string | null;
  phone: string | null;
  image: string | null;
  createdAt: string;
  avgRating: number;
  totalReviews: number;
  kycStatus?: string;
  products: Array<{ id: string; title: string; description: string; priceCOP: number; city: string; status: string; createdAt: string }>;
  soldProducts: Array<{ id: string; title: string; description: string; priceCOP: number; city: string; soldAt: string | null }>;
  receivedReviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; fromUser: { name: string | null }; product: { title: string } }>;
};

type FavProduct = {
  id: string; title: string; description: string;
  priceCOP: number; city: string; status: string;
  images: { url: string }[];
};

export default function UserProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"products" | "sold" | "reviews" | "favorites">("products");
  const [favorites, setFavorites] = useState<FavProduct[]>([]);
  const [loadingFavs, setLoadingFavs] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/users/${id}`)
      .then(res => { if (!res.ok) throw new Error(`Error ${res.status}`); return res.json(); })
      .then(data => {
        setUser({ ...data, products: data.products || [], soldProducts: data.soldProducts || [], receivedReviews: data.receivedReviews || [] });
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (activeTab !== "favorites") return;
    setLoadingFavs(true);
    fetch("/api/favorites?list=true")
      .then(r => r.json())
      .then(d => { setFavorites(d.favorites || []); setLoadingFavs(false); })
      .catch(() => setLoadingFavs(false));
  }, [activeTab]);

  if (loading) return <div style={{ textAlign: "center", padding: "4rem", color: THEME.primary, fontFamily: "sans-serif" }}>Cargando...</div>;
  if (error) return <div style={{ textAlign: "center", padding: "2rem", color: "red" }}>Error: {error}</div>;
  if (!user) return <div style={{ textAlign: "center", padding: "2rem" }}>Usuario no encontrado</div>;

  const isOwnProfile = session?.user?.id === user.id;
  const isVerified = user.kycStatus === "approved";

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: "0.6rem 1.1rem",
    border: "none",
    background: "none",
    color: activeTab === t ? AZUL : THEME.muted,
    fontWeight: activeTab === t ? 800 : 500,
    borderBottom: activeTab === t ? `3px solid ${AZUL}` : "3px solid transparent",
    cursor: "pointer",
    fontSize: "0.9rem",
    transition: "all 0.2s",
  });

  return (
    <div style={{ background: THEME.background, minHeight: "100vh", color: THEME.text, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 20px rgba(10,46,107,0.25)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 42, width: "auto", display: "block" }} />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "7px 14px", cursor: "pointer", color: "white", fontSize: 13, fontWeight: 700, lineHeight: 1 }}
          >
            ← Volver
          </button>
          <button
            onClick={() => router.push("/")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "7px 14px", cursor: "pointer", color: "white", fontSize: 13, fontWeight: 700, lineHeight: 1 }}
          >
            🏠 Inicio
          </button>
          {session ? (
            !isOwnProfile && (
              <Link href={`/user/${session.user.id}`} style={{ color: "white", fontSize: 13, textDecoration: "none", padding: "6px 14px", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 20 }}>Mi perfil</Link>
            )
          ) : (
            <>
              <Link href="/auth/login" style={{ color: "white", fontSize: 13, textDecoration: "none" }}>Iniciar sesión</Link>
              <Link href="/auth/register" style={{ color: "white", fontSize: 13, textDecoration: "none", padding: "6px 14px", background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 20 }}>Registrarse</Link>
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem 4rem" }}>

        {/* Tarjeta de perfil */}
        <div style={{ background: THEME.surfaceGradient, boxShadow: THEME.cardShadow, borderRadius: 20, padding: "1.75rem", marginBottom: "1.5rem", border: "1.5px solid transparent", display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {user.image ? (
            <img src={user.image} alt={user.name || "Usuario"} style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: `3px solid ${DORADO}` }} onError={e => (e.currentTarget.style.display = "none")} />
          ) : (
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", color: "white", fontWeight: 900 }}>
              {(user.name || "?")[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ color: THEME.text, margin: "0 0 0.4rem", fontSize: "1.4rem", fontWeight: 900, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {user.name || "Usuario"}
              {isVerified && (
                <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.18rem 0.7rem", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700 }}>✓ Verificado</span>
              )}
            </h1>
            {user.city && <p style={{ margin: "0.2rem 0", fontSize: "0.9rem", color: THEME.textSoft }}>📍 {user.city}</p>}
            <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: THEME.muted }}>Miembro desde: {new Date(user.createdAt).toLocaleDateString("es-CO")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "0.6rem" }}>
              <span style={{ fontSize: "1.2rem", fontWeight: 800, color: DORADO }}>{user.avgRating > 0 ? user.avgRating.toFixed(1) : "Nuevo"}</span>
              <span style={{ fontSize: "0.9rem", color: THEME.muted }}>⭐ ({user.totalReviews} reseñas)</span>
            </div>
            <div style={{ marginTop: "0.7rem" }}><TrustBadge userId={user.id} /></div>
          </div>
          {isOwnProfile && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href="/perfil/editar" style={{ textDecoration: "none" }}>
                <Button>Editar perfil</Button>
              </Link>
              {!isVerified && (
                <Link href="/kyc" style={{ textDecoration: "none" }}>
                  <OutlineButton>Verificar perfil</OutlineButton>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Pestañas */}
        <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", overflowX: "auto", paddingBottom: 4 }}>
          {/* En venta — amarillo */}
          <button onClick={() => setActiveTab("products")} style={{ flex: 1, minWidth: 80, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: "100%", height: 6, borderRadius: 4, background: activeTab === "products" ? "#FFCD00" : THEME.border, transition: "background 0.2s" }} />
            <span style={{ fontSize: "0.85rem", fontWeight: activeTab === "products" ? 800 : 500, color: activeTab === "products" ? "#c99a00" : THEME.muted }}>En venta ({user.products.length})</span>
          </button>
          {/* Vendidos — azul bandera */}
          <button onClick={() => setActiveTab("sold")} style={{ flex: 1, minWidth: 80, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: "100%", height: 6, borderRadius: 4, background: activeTab === "sold" ? THEME.primary : THEME.border, transition: "background 0.2s" }} />
            <span style={{ fontSize: "0.85rem", fontWeight: activeTab === "sold" ? 800 : 500, color: activeTab === "sold" ? THEME.primary : THEME.muted }}>Vendidos ({user.soldProducts?.length || 0})</span>
          </button>
          {/* Reseñas — rojo */}
          <button onClick={() => setActiveTab("reviews")} style={{ flex: 1, minWidth: 80, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: "100%", height: 6, borderRadius: 4, background: activeTab === "reviews" ? "#ff5a6e" : THEME.border, transition: "background 0.2s" }} />
            <span style={{ fontSize: "0.85rem", fontWeight: activeTab === "reviews" ? 800 : 500, color: activeTab === "reviews" ? "#d6334a" : THEME.muted }}>Reseñas ({user.receivedReviews.length})</span>
          </button>
          {/* Favoritos — solo propietario */}
          {isOwnProfile && (
            <button onClick={() => setActiveTab("favorites")} style={{ flex: 1, minWidth: 80, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", height: 6, borderRadius: 4, background: activeTab === "favorites" ? "#e91e8c" : THEME.border, transition: "background 0.2s" }} />
              <span style={{ fontSize: "0.85rem", fontWeight: activeTab === "favorites" ? 800 : 500, color: activeTab === "favorites" ? "#c21876" : THEME.muted }}>❤️ Favoritos</span>
            </button>
          )}
        </div>

        {/* En venta */}
        {activeTab === "products" && (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {user.products.length === 0 ? (
              <EmptyState icon="🛍️" text="No tiene productos activos." />
            ) : user.products.map(p => (
              <ProductRow key={p.id} id={p.id} title={p.title} description={p.description} price={p.priceCOP} badge={p.status === "PAYMENT_PENDING" ? "⏳ En pago" : p.status === "IN_ESCROW" ? "🔒 En custodia" : undefined} />
            ))}
          </div>
        )}

        {/* Vendidos */}
        {activeTab === "sold" && (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {!user.soldProducts || user.soldProducts.length === 0 ? (
              <EmptyState icon="📦" text="No ha vendido productos aún." />
            ) : user.soldProducts.map(p => (
              <ProductRow key={p.id} id={p.id} title={p.title} description={p.description} price={p.priceCOP} badge={p.soldAt ? `Vendido el ${new Date(p.soldAt).toLocaleDateString("es-CO")}` : "Vendido"} dimmed />
            ))}
          </div>
        )}

        {/* Reseñas */}
        {activeTab === "reviews" && (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {user.receivedReviews.length === 0 ? (
              <EmptyState icon="⭐" text="Aún no tiene reseñas." />
            ) : user.receivedReviews.map(r => (
              <div key={r.id} style={{ background: THEME.surfaceGradient, boxShadow: THEME.cardShadow, borderRadius: 14, padding: "1rem 1.25rem", border: "1.5px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.92rem", color: THEME.text }}>{r.fromUser.name || "Anónimo"}</span>
                  <span style={{ color: DORADO, fontWeight: 800 }}>{"⭐".repeat(r.rating)}</span>
                </div>
                {r.comment && <p style={{ margin: "0 0 0.4rem", color: THEME.textSoft, fontSize: "0.88rem", lineHeight: 1.5 }}>{r.comment}</p>}
                <p style={{ fontSize: "0.75rem", color: THEME.muted, margin: 0 }}>
                  {r.product.title} • {new Date(r.createdAt).toLocaleDateString("es-CO")}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Favoritos (solo propietario) */}
        {activeTab === "favorites" && isOwnProfile && (
          <div>
            {loadingFavs ? (
              <div style={{ textAlign: "center", padding: "2rem", color: THEME.primary }}>Cargando favoritos...</div>
            ) : favorites.length === 0 ? (
              <EmptyState icon="❤️" text="Aún no tienes productos favoritos. Dale ❤️ a los productos que te interesen." />
            ) : (
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {favorites.map(p => (
                  <div key={p.id} style={{ background: THEME.surfaceGradient, boxShadow: THEME.cardShadow, borderRadius: 14, padding: "1rem 1.25rem", border: "1.5px solid transparent", display: "flex", gap: "1rem", alignItems: "center" }}>
                    {p.images?.[0]?.url && (
                      <img src={p.images[0].url} alt={p.title} style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: "0 0 0.25rem", fontSize: "0.95rem", fontWeight: 800, color: THEME.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</h3>
                      <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", color: THEME.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.description}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 800, color: THEME.primary, fontSize: "1rem" }}>${p.priceCOP.toLocaleString("es-CO")}</span>
                        <Link href={`/product/${p.id}`} style={{ color: THEME.primary, textDecoration: "none", fontSize: "0.82rem", fontWeight: 700 }}>
                          Ver producto →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ProductRow({ id, title, description, price, badge, dimmed }: { id: string; title: string; description: string; price: number; badge?: string; dimmed?: boolean }) {
  return (
    <div style={{ background: THEME.surfaceGradient, boxShadow: THEME.cardShadow, borderRadius: 14, padding: "1rem 1.25rem", border: "1.5px solid transparent", opacity: dimmed ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 0.25rem", fontSize: "0.95rem", fontWeight: 800, color: THEME.text }}>{title}</h3>
          <p style={{ margin: "0 0 0.5rem", color: THEME.muted, fontSize: "0.83rem", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{description}</p>
          {badge && <span style={{ background: THEME.surfaceAlt, color: THEME.primary, padding: "0.15rem 0.6rem", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600 }}>{badge}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <span style={{ fontWeight: 800, color: THEME.primary, fontSize: "1.05rem" }}>${price.toLocaleString("es-CO")}</span>
          <Link href={`/product/${id}`} style={{ color: THEME.primary, textDecoration: "none", fontSize: "0.82rem", fontWeight: 700, whiteSpace: "nowrap" }}>Ver producto →</Link>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ background: THEME.surface, boxShadow: THEME.cardShadow, borderRadius: 16, padding: "2.5rem", textAlign: "center", border: `1.5px dashed ${THEME.border}` }}>
      <p style={{ fontSize: "2.5rem", margin: "0 0 0.75rem" }}>{icon}</p>
      <p style={{ color: THEME.muted, margin: 0, fontSize: "0.9rem" }}>{text}</p>
    </div>
  );
}
