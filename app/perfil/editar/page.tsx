"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const colors = {
  primary: "#00589F",
  secondary: "#D4AF37",
  background: "#f5f7fa",
  text: "#1e2b3c",
  lightGray: "#eef2f6",
  white: "#ffffff",
};

export default function EditarPerfilPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    city: "",
    image: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/user", { credentials: "include" })
        .then(res => {
          if (!res.ok) throw new Error("Error al cargar perfil");
          return res.json();
        })
        .then(data => {
          setFormData({
            name: data.name || "",
            phone: data.phone || "",
            city: data.city || "",
            image: data.image || "",
          });
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          alert("Error al cargar los datos del perfil");
          setLoading(false);
        });
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Error al guardar");
      }
      alert("Perfil actualizado correctamente");
      router.push(`/user/${session?.user?.id}`);
    } catch (error: any) {
      console.error(error);
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: "2rem" }}>Cargando...</div>;

  return (
    <div style={{ backgroundColor: colors.background, minHeight: "100vh", color: colors.text }}>
      <header style={{ backgroundColor: colors.primary, color: colors.white, padding: "1rem 2rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>COLBISNES</h1>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
        <div style={{ backgroundColor: colors.white, borderRadius: 20, padding: "2rem", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <h2 style={{ color: colors.primary, marginTop: 0 }}>Editar perfil</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Nombre</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                style={{ width: "100%", padding: "0.75rem", borderRadius: 8, border: `1px solid ${colors.lightGray}` }}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Teléfono</label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                style={{ width: "100%", padding: "0.75rem", borderRadius: 8, border: `1px solid ${colors.lightGray}` }}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Ciudad</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                style={{ width: "100%", padding: "0.75rem", borderRadius: 8, border: `1px solid ${colors.lightGray}` }}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>URL de foto de perfil</label>
              <input
                type="url"
                value={formData.image}
                onChange={e => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://ejemplo.com/mi-foto.jpg"
                style={{ width: "100%", padding: "0.75rem", borderRadius: 8, border: `1px solid ${colors.lightGray}` }}
              />
              {formData.image && (
                <div style={{ marginTop: "1rem" }}>
                  <p style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Vista previa:</p>
                  <img
                    src={formData.image}
                    alt="Vista previa"
                    style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: `2px solid ${colors.primary}` }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: "0.75rem 2rem", borderRadius: 30, border: "none", background: colors.secondary, color: colors.primary, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                style={{ padding: "0.75rem 2rem", borderRadius: 30, border: `1px solid ${colors.primary}`, background: "transparent", color: colors.primary, fontWeight: 600, cursor: "pointer" }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
