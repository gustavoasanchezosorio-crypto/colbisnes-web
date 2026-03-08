"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";

const colors = {
  primary: "#00589F",
  secondary: "#D4AF37",
  background: "#f5f7fa",
  text: "#1e2b3c",
  lightGray: "#eef2f6",
  white: "#ffffff",
};

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  city: string | null;
  phone: string | null;
  image: string | null;
  createdAt: string;
  avgRating: number;
  totalReviews: number;
  products: Array<{
    id: string;
    title: string;
    description: string;
    priceCOP: number;
    city: string;
    status: string;
    createdAt: string;
  }>;
  soldProducts: Array<{
    id: string;
    title: string;
    description: string;
    priceCOP: number;
    city: string;
    soldAt: string | null;
  }>;
  receivedReviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    fromUser: { name: string | null };
    product: { title: string };
  }>;
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

export default function UserProfilePage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"products" | "sold" | "reviews">("products");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/users/${id}`)
      .then(res => res.json())
      .then(data => {
        setUser(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div style={{ textAlign: "center", padding: "2rem" }}>Cargando...</div>;
  if (!user) return <div style={{ textAlign: "center", padding: "2rem" }}>Usuario no encontrado</div>;

  const isOwnProfile = session?.user?.id === user.id;

  return (
    <div style={{ backgroundColor: colors.background, minHeight: "100vh", color: colors.text }}>
      <header style={{ backgroundColor: colors.primary, color: colors.white, padding: "1rem 2rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ color: colors.white, textDecoration: "none", fontSize: "1.5rem", fontWeight: 700 }}>
            COLBISNES
          </Link>
          <div>
            {session ? (
              <>
                <span style={{ marginRight: "1rem" }}>👤 {session.user?.name || session.user?.email}</span>
                {!isOwnProfile && (
                  <Link href={`/user/${session.user.id}`} style={{ color: colors.white, marginRight: "1rem" }}>
                    Mi perfil
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/auth/login" style={{ color: colors.white, marginRight: "1rem" }}>Iniciar sesión</Link>
                <Link href="/auth/register" style={{ color: colors.white }}>Registrarse</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "2rem auto", padding: "0 1rem" }}>
        {/* Tarjeta de información del usuario con foto */}
        <div style={{
          backgroundColor: colors.white,
          borderRadius: 20,
          padding: "2rem",
          marginBottom: "2rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          display: "flex",
          gap: "2rem",
          alignItems: "center",
          flexWrap: "wrap"
        }}>
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || "Usuario"}
              style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: `3px solid ${colors.secondary}` }}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: "50%", backgroundColor: colors.lightGray, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", color: colors.primary }}>
              👤
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ color: colors.primary, margin: "0 0 0.5rem 0" }}>{user.name || "Usuario"}</h1>
            <p style={{ margin: "0.25rem 0" }}>📍 {user.city || "Ciudad no especificada"}</p>
            <p style={{ margin: "0.25rem 0" }}>📧 {user.email}</p>
            {user.phone && <p style={{ margin: "0.25rem 0" }}>📞 {user.phone}</p>}
            <p style={{ margin: "0.25rem 0" }}>Miembro desde: {new Date(user.createdAt).toLocaleDateString("es-CO")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: colors.secondary }}>
                {user.avgRating > 0 ? user.avgRating.toFixed(1) : "Nuevo"}
              </span>
              <span>⭐ ({user.totalReviews} reseñas)</span>
            </div>
          </div>
          {isOwnProfile && (
            <Link
              href="/perfil/editar"
              style={{ padding: "0.5rem 1.5rem", borderRadius: 30, border: `1px solid ${colors.primary}`, background: "transparent", color: colors.primary, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
            >
              Editar perfil
            </Link>
          )}
        </div>

        {/* Pestañas */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: `2px solid ${colors.lightGray}` }}>
          <button
            onClick={() => setActiveTab("products")}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "none",
              color: activeTab === "products" ? colors.primary : "#666",
              fontWeight: activeTab === "products" ? 700 : 400,
              borderBottom: activeTab === "products" ? `3px solid ${colors.primary}` : "none",
              cursor: "pointer"
            }}
          >
            En venta ({user.products.length})
          </button>
          <button
            onClick={() => setActiveTab("sold")}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "none",
              color: activeTab === "sold" ? colors.primary : "#666",
              fontWeight: activeTab === "sold" ? 700 : 400,
              borderBottom: activeTab === "sold" ? `3px solid ${colors.primary}` : "none",
              cursor: "pointer"
            }}
          >
            Vendidos ({user.soldProducts?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("reviews")}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "none",
              color: activeTab === "reviews" ? colors.primary : "#666",
              fontWeight: activeTab === "reviews" ? 700 : 400,
              borderBottom: activeTab === "reviews" ? `3px solid ${colors.primary}` : "none",
              cursor: "pointer"
            }}
          >
            Reseñas ({user.receivedReviews.length})
          </button>
        </div>

        {/* Contenido de pestañas (omitido por brevedad, pero debe ser igual al que ya tenías funcionando) */}
        {activeTab === "products" && (
          <div>
            {user.products.length === 0 ? (
              <p style={{ color: "#666", padding: "1rem", background: colors.white, borderRadius: 16 }}>
                Este usuario no tiene productos activos.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {user.products.map(p => (
                  <div key={p.id} style={{
                    backgroundColor: colors.white,
                    borderRadius: 16,
                    padding: "1rem",
                    border: `1px solid ${colors.lightGray}`
                  }}>
                    <h3 style={{ margin: "0 0 0.5rem 0" }}>{p.title}</h3>
                    <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>{p.description}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: colors.secondary }}>{moneyCOP(p.priceCOP)}</span>
                      <Link href={`/product/${p.id}`} style={{ color: colors.primary, textDecoration: "none" }}>
                        Ver producto →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "sold" && (
          <div>
            {!user.soldProducts || user.soldProducts.length === 0 ? (
              <p style={{ color: "#666", padding: "1rem", background: colors.white, borderRadius: 16 }}>
                Este usuario no ha vendido productos aún.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {user.soldProducts.map(p => (
                  <div key={p.id} style={{
                    backgroundColor: colors.white,
                    borderRadius: 16,
                    padding: "1rem",
                    border: `1px solid ${colors.lightGray}`,
                    opacity: 0.8
                  }}>
                    <h3 style={{ margin: "0 0 0.5rem 0" }}>{p.title}</h3>
                    <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>{p.description}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: colors.secondary }}>{moneyCOP(p.priceCOP)}</span>
                      <span style={{ fontSize: "0.9rem", color: "#666" }}>
                        Vendido el {p.soldAt ? new Date(p.soldAt).toLocaleDateString("es-CO") : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div>
            {user.receivedReviews.length === 0 ? (
              <p style={{ color: "#666", padding: "1rem", background: colors.white, borderRadius: 16 }}>
                Aún no tiene reseñas.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {user.receivedReviews.map(r => (
                  <div key={r.id} style={{
                    backgroundColor: colors.white,
                    borderRadius: 16,
                    padding: "1rem",
                    border: `1px solid ${colors.lightGray}`
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>{r.fromUser.name || "Anónimo"}</span>
                      <span style={{ color: colors.secondary, fontWeight: 700 }}>{r.rating} ⭐</span>
                    </div>
                    {r.comment && <p style={{ margin: "0.5rem 0", color: "#666" }}>{r.comment}</p>}
                    <p style={{ fontSize: "0.8rem", color: "#999" }}>
                      Producto: {r.product.title} • {new Date(r.createdAt).toLocaleDateString("es-CO")}
                    </p>
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
