"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, OutlineButton, Input } from "@/components/FormComponents";
import { THEME } from "@/lib/theme";

export default function EditarPerfilPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Solo se permiten imágenes");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen no debe superar 5MB");
      return;
    }

    setUploading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("image", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: uploadForm,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir imagen");
      setFormData(prev => ({ ...prev, image: data.url }));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

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
    <div style={{ minHeight: "100vh", background: THEME.background, color: THEME.text }}>
      <header style={{ background: THEME.primary, padding: "18px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ maxWidth: 1200, margin: "auto" }}>
          <h1 style={{ fontWeight: 800, fontSize: "1.6rem", color: "white", margin: 0 }}>COLBISNES</h1>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
        <div style={{ background: THEME.surface, borderRadius: 20, padding: "2rem", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <h2 style={{ color: THEME.primary, marginTop: 0 }}>Editar perfil</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Nombre</label>
              <Input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Teléfono</label>
              <Input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Ciudad</label>
              <Input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Foto de perfil</label>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                {formData.image && (
                  <img
                    src={formData.image}
                    alt="Vista previa"
                    style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }}
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={uploading}
                  style={{
                    padding: "8px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.border}`,
                    background: "white",
                  }}
                />
                {uploading && <span>Subiendo...</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
              <OutlineButton onClick={() => router.back()}>Cancelar</OutlineButton>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
