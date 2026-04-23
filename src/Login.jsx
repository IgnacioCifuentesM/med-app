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

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    onLogin(data.user, profile);
    setLoading(false);
  };

  const handleRegister = async () => {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    await supabase.from("profiles").insert({ id: data.user.id, role, full_name: name });
    setSuccess("¡Cuenta creada! Ahora inicia sesión.");
    setMode("login");
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f4f0", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:"32px 28px", width:"100%", maxWidth:380 }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:28, fontWeight:800, color:"#1D9E75" }}>vita<span style={{ color:"#222" }}>lia</span></div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Medicina de estilo de vida</div>
        </div>

        <div style={{ display:"flex", border:"1px solid #eee", borderRadius:10, overflow:"hidden", marginBottom:24 }}>
          <button onClick={()=>{ setMode("login"); setError(""); setSuccess(""); }}
            style={{ flex:1, padding:"10px 0", fontSize:14, border:"none", background:mode==="login"?"#1D9E75":"transparent", color:mode==="login"?"#fff":"#888", cursor:"pointer" }}>
            Iniciar sesión
          </button>
          <button onClick={()=>{ setMode("register"); setError(""); setSuccess(""); }}
            style={{ flex:1, padding:"10px 0", fontSize:14, border:"none", background:mode==="register"?"#1D9E75":"transparent", color:mode==="register"?"#fff":"#888", cursor:"pointer" }}>
            Registrarse
          </button>
        </div>

        {error && <div style={{ background:"#FAECE7", color:"#4A1B0C", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:12 }}>⚠️ {error}</div>}
        {success && <div style={{ background:"#E1F5EE", color:"#085041", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:12 }}>✓ {success}</div>}

        {mode==="register" && (
          <>
            <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>Nombre completo</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Tu nombre"
              style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid #ddd", fontSize:14, marginBottom:14, boxSizing:"border-box" }} />
            <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>Soy...</div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <button onClick={()=>setRole("patient")}
                style={{ flex:1, padding:"10px 0", fontSize:13, border:`2px solid ${role==="patient"?"#1D9E75":"#eee"}`, background:role==="patient"?"#E1F5EE":"transparent", color:role==="patient"?"#085041":"#888", borderRadius:10, cursor:"pointer" }}>
                🧑 Paciente
              </button>
              <button onClick={()=>setRole("doctor")}
                style={{ flex:1, padding:"10px 0", fontSize:13, border:`2px solid ${role==="doctor"?"#1D9E75":"#eee"}`, background:role==="doctor"?"#E1F5EE":"transparent", color:role==="doctor"?"#085041":"#888", borderRadius:10, cursor:"pointer" }}>
                👨‍⚕️ Doctor
              </button>
            </div>
          </>
        )}

        <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>Email</div>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"
          style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid #ddd", fontSize:14, marginBottom:14, boxSizing:"border-box" }} />

        <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>Contraseña</div>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
          style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid #ddd", fontSize:14, marginBottom:14, boxSizing:"border-box" }} />

        <button onClick={mode==="login" ? handleLogin : handleRegister} disabled={loading}
          style={{ width:"100%", padding:"12px 0", background:"#1D9E75", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer" }}>
          {loading ? "Cargando..." : mode==="login" ? "Entrar" : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}