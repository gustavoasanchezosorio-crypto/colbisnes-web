"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (res.ok) {
      router.push("/auth/login");
    } else {
      const data = await res.json();
      setError(data.error || "Error al registrar");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", padding: "2rem", background: "#fff", borderRadius: 20 }}>
      <h1>Registro</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem", borderRadius: 8, border: "1px solid #ccc" }}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem", borderRadius: 8, border: "1px solid #ccc" }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem", borderRadius: 8, border: "1px solid #ccc" }}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button
          type="submit"
          style={{ width: "100%", padding: "0.75rem", background: "#00589F", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600 }}
        >
          Registrarse
        </button>
      </form>
      <p style={{ marginTop: "1rem", textAlign: "center" }}>
        ¿Ya tienes cuenta? <a href="/auth/login">Inicia sesión</a>
      </p>
    </div>
  );
}
