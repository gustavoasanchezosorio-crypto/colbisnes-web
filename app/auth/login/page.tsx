"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (result?.error) {
      setError(result.error);
    } else {
      router.push("/");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", padding: "2rem", background: "#fff", borderRadius: 20 }}>
      <h1>Iniciar sesión</h1>
      <form onSubmit={handleSubmit}>
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
          Ingresar
        </button>
      </form>
      <p style={{ marginTop: "1rem", textAlign: "center" }}>
        ¿No tienes cuenta? <a href="/auth/register">Regístrate</a>
      </p>
    </div>
  );
}
