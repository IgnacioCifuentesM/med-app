import { useState } from "react";
import { supabase } from "./supabase";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // =========================================================
  // LOGIN
  // =========================================================
  const handleLogin = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    onLogin(data.user, profile);
    setLoading(false);
  };

  // =========================================================
  // REGISTRO
  // =========================================================
  const handleRegister = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Ingresa tu nombre.");
      setLoading(false);
      return;
    }

    if (!email.trim()) {
      setError("Ingresa tu email.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: data.user.id,
          role,
          full_name: name,
        });

      if (profileError) {
        console.error("Error creando perfil:", profileError);
      }
    }

    setSuccess("¡Cuenta creada! Ahora inicia sesión.");
    setMode("login");
    setPassword("");
    setLoading(false);
  };

  // =========================================================
  // RECUPERAR CONTRASEÑA
  // =========================================================
  const handleForgotPassword = async () => {
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Ingresa tu email para recuperar tu contraseña.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(
      "Te enviamos un correo para cambiar tu contraseña. Revisa también tu carpeta de spam."
    );

    setLoading(false);
  };

  // =========================================================
  // ENTER
  // =========================================================
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) {
      if (mode === "login") {
        handleLogin();
      } else {
        handleRegister();
      }
    }
  };

  // =========================================================
  // UI
  // =========================================================
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f4f0",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "32px 28px",
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 10px 35px rgba(0,0,0,0.06)",
        }}
      >
        {/* LOGO */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#1D9E75",
            }}
          >
            vita<span style={{ color: "#222" }}>lia</span>
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#888",
              marginTop: 4,
            }}
          >
            Tu salud, acompañada
          </div>
        </div>

        {/* LOGIN / REGISTRO */}
        <div
          style={{
            display: "flex",
            border: "1px solid #eee",
            borderRadius: 10,
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => {
              setMode("login");
              setError("");
              setSuccess("");
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 14,
              border: "none",
              background: mode === "login" ? "#1D9E75" : "transparent",
              color: mode === "login" ? "#fff" : "#888",
              cursor: "pointer",
            }}
          >
            Iniciar sesión
          </button>

          <button
            onClick={() => {
              setMode("register");
              setError("");
              setSuccess("");
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 14,
              border: "none",
              background: mode === "register" ? "#1D9E75" : "transparent",
              color: mode === "register" ? "#fff" : "#888",
              cursor: "pointer",
            }}
          >
            Registrarse
          </button>
        </div>

        {/* MENSAJES */}
        {error && (
          <div
            style={{
              background: "#FAECE7",
              color: "#4A1B0C",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: "#E1F5EE",
              color: "#085041",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            ✓ {success}
          </div>
        )}

        {/* DATOS EXTRA PARA REGISTRO */}
        {mode === "register" && (
          <>
            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 6,
              }}
            >
              Nombre completo
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tu nombre"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                fontSize: 14,
                marginBottom: 14,
                boxSizing: "border-box",
              }}
            />

            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 6,
              }}
            >
              Soy...
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <button
                onClick={() => setRole("patient")}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 13,
                  border: `2px solid ${
                    role === "patient" ? "#1D9E75" : "#eee"
                  }`,
                  background:
                    role === "patient" ? "#E1F5EE" : "transparent",
                  color: role === "patient" ? "#085041" : "#888",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                🧑 Paciente
              </button>

              <button
                onClick={() => setRole("doctor")}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 13,
                  border: `2px solid ${
                    role === "doctor" ? "#1D9E75" : "#eee"
                  }`,
                  background:
                    role === "doctor" ? "#E1F5EE" : "transparent",
                  color: role === "doctor" ? "#085041" : "#888",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                👨‍⚕️ Doctor
              </button>
            </div>
          </>
        )}

        {/* EMAIL */}
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
          }}
        >
          Email
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="tu@email.com"
          autoComplete="email"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 14,
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        />

        {/* PASSWORD */}
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
          }}
        >
          Contraseña
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mínimo 6 caracteres"
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 14,
            marginBottom: mode === "login" ? 8 : 14,
            boxSizing: "border-box",
          }}
        />

        {/* OLVIDÉ CONTRASEÑA */}
        {mode === "login" && (
          <div
            style={{
              textAlign: "right",
              marginBottom: 18,
            }}
          >
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#1D9E75",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}

        {/* BOTÓN PRINCIPAL */}
        <button
          onClick={mode === "login" ? handleLogin : handleRegister}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 0",
            background: loading ? "#8CCBB7" : "#1D9E75",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading
            ? "Cargando..."
            : mode === "login"
            ? "Entrar"
            : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}