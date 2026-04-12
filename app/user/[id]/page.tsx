"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, OutlineButton } from "@/components/FormComponents";
import { THEME } from "@/lib/theme";
import { formatMoney } from "@/lib/utils";

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
  kycStatus?: string;
  nequiNumber?: string;
  brebId?: string;
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

export default function UserProfilePage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"products" | "sold" | "reviews">("products");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/users/${id}`)
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Asegurar que los arrays existan
        setUser({
          ...data,
          products: data.products || [],
          soldProducts: data.soldProducts || [],
          receivedReviews: data.receivedReviews || [],
        });
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div style={{ textAlign: "center", padding: "2rem" }}>Cargando...</div>;
  if (error) return <div style={{ textAlign: "center", padding: "2rem", color: "red" }}>Error: {error}</div>;
  if (!user) return <div style={{ textAlign: "center", padding: "2rem" }}>Usuario no encontrado</div>;

  const isOwnProfile = session?.user?.id === user.id;
  const isVerified = user.kycStatus === "approved";

  return (
    <div style={{ background: THEME.background, minHeight: "100vh", color: THEME.text }}>
      <header style={{ background: THEME.primary, padding: "18px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ maxWidth: 1200, margin: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ color: "white", textDecoration: "none", fontSize: "1.5rem", fontWeight: 700 }}>
            COLBISNES
          </Link>
          <div>
            {session ? (
              <>
                <span style={{ marginRight: "1rem", color: "white" }}>👤 {session.user?.name || session.user?.email}</span>
                {!isOwnProfile && (
                  <Link href={`/user/${session.user.id}`} style={{ color: "white", marginRight: "1rem" }}>
                    Mi perfil
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/auth/login" style={{ color: "white", marginRight: "1rem" }}>Iniciar sesión</Link>
                <Link href="/auth/register" style={{ color: "white" }}>Registrarse</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "2rem auto", padding: "0 1rem" }}>
        <div style={{
          background: THEME.surface,
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
              style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: `3px solid ${THEME.secondary}` }}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: "50%", background: THEME.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", color: THEME.primary }}>
              👤
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ color: THEME.primary, margin: "0 0 0.5rem 0", display: "flex", alignItems: "center", gap: 8 }}>
              {user.name || "Usuario"}
              {isVerified && (
                <span style={{ background: THEME.secondary, color: THEME.text, padding: "0.2rem 0.6rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600 }}>
                  ✓ Verificado
                </span>
              )}
            </h1>
            <p style={{ margin: "0.25rem 0" }}>📍 {user.city || "Ciudad no especificada"}</p>
            <p style={{ margin: "0.25rem 0" }}>📧 {user.email}</p>
            {user.phone && <p style={{ margin: "0.25rem 0" }}>📞 {user.phone}</p>}
            <p style={{ margin: "0.25rem 0" }}>Miembro desde: {new Date(user.createdAt).toLocaleDateString("es-CO")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: THEME.secondary }}>
                {user.avgRating > 0 ? user.avgRating.toFixed(1) : "Nuevo"}
              </span>
              <span>⭐ ({user.totalReviews} reseñas)</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {isOwnProfile && (
              <Link href="/perfil/editar" style={{ textDecoration: "none" }}>
                <Button>Editar perfil</Button>
              </Link>
            )}
            {isOwnProfile && !isVerified && (
              <Link href="/kyc" style={{ textDecoration: "none" }}>
                <OutlineButton>Verificar perfil como vendedor</OutlineButton>
              </Link>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: `2px solid ${THEME.border}` }}>
          <button
            onClick={() => setActiveTab("products")}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "none",
              color: activeTab === "products" ? THEME.primary : "#666",
              fontWeight: activeTab === "products" ? 700 : 400,
              borderBottom: activeTab === "products" ? `3px solid ${THEME.primary}` : "none",
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
              color: activeTab === "sold" ? THEME.primary : "#666",
              fontWeight: activeTab === "sold" ? 700 : 400,
              borderBottom: activeTab === "sold" ? `3px solid ${THEME.primary}` : "none",
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
              color: activeTab === "reviews" ? THEME.primary : "#666",
              fontWeight: activeTab === "reviews" ? 700 : 400,
              borderBottom: activeTab === "reviews" ? `3px solid ${THEME.primary}` : "none",
              cursor: "pointer"
            }}
          >
            Reseñas ({user.receivedReviews.length})
          </button>
        </div>

        {activeTab === "products" && (
          <div>
            {user.products.length === 0 ? (
              <p style={{ color: "#666", padding: "1rem", background: THEME.surface, borderRadius: 16 }}>
                Este usuario no tiene productos activos.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {user.products.map(p => (
                  <div key={p.id} style={{
                    background: THEME.surface,
                    borderRadius: 16,
                    padding: "1rem",
                    border: `1px solid ${THEME.border}`
                  }}>
                    <h3 style={{ margin: "0 0 0.5rem 0" }}>{p.title}</h3>
                    <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>{p.description}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: THEME.secondary }}>{formatMoney(p.priceCOP)}</span>
                      <Link href={`/product/${p.id}`} style={{ color: THEME.primary, textDecoration: "none" }}>
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
              <p style={{ color: "#666", padding: "1rem", background: THEME.surface, borderRadius: 16 }}>
                Este usuario no ha vendido productos aún.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {user.soldProducts.map(p => (
                  <div key={p.id} style={{
                    background: THEME.surface,
                    borderRadius: 16,
                    padding: "1rem",
                    border: `1px solid ${THEME.border}`,
                    opacity: 0.8
                  }}>
                    <h3 style={{ margin: "0 0 0.5rem 0" }}>{p.title}</h3>
                    <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>{p.description}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: THEME.secondary }}>{formatMoney(p.priceCOP)}</span>
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
              <p style={{ color: "#666", padding: "1rem", background: THEME.surface, borderRadius: 16 }}>
                Aún no tiene reseñas.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {user.receivedReviews.map(r => (
                  <div key={r.id} style={{
                    background: THEME.surface,
                    borderRadius: 16,
                    padding: "1rem",
                    border: `1px solid ${THEME.border}`
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>{r.fromUser.name || "Anónimo"}</span>
                      <span style={{ color: THEME.secondary, fontWeight: 700 }}>{r.rating} ⭐</span>
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
