import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Radar, Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, RadialLinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend, CategoryScale, LinearScale, BarElement,
} from "chart.js";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const COLORS = {
  nutricion:  { main:"#1D9E75", light:"#E1F5EE", dark:"#085041" },
  actividad:  { main:"#378ADD", light:"#E6F1FB", dark:"#0C447C" },
  sueno:      { main:"#534AB7", light:"#EEEDFE", dark:"#26215C" },
  sustancias: { main:"#D85A30", light:"#FAECE7", dark:"#4A1B0C" },
  estres:     { main:"#BA7517", light:"#FAEEDA", dark:"#633806" },
  conexion:   { main:"#993556", light:"#FBEAF0", dark:"#4B1528" },
};

const PILLARS = [
  { key:"nutricion",  icon:"🥗", name:"Nutrición",  fields:[
    { label:"Porciones frutas/verduras hoy", type:"range", min:0, max:10, val:5 },
    { label:"Calidad alimentación (1-10)",   type:"range", min:1, max:10, val:7 },
    { label:"Vasos de agua",                 type:"range", min:0, max:12, val:6 },
    { label:"Nota libre", type:"text", placeholder:"Ej: comí sano en el almuerzo" },
  ]},
  { key:"actividad",  icon:"🏃", name:"Actividad",  fields:[
    { label:"Pasos hoy",           type:"range", min:0, max:20000, val:8000 },
    { label:"Minutos ejercicio",   type:"range", min:0, max:120,   val:30 },
    { label:"Intensidad (1-10)",   type:"range", min:1, max:10,    val:6 },
  ]},
  { key:"sueno",      icon:"🌙", name:"Sueño",      fields:[
    { label:"Horas dormidas",      type:"range", min:0, max:12, val:7 },
    { label:"Calidad (1-10)",      type:"range", min:1, max:10, val:7 },
    { label:"Hora que te dormiste", type:"text", placeholder:"Ej: 23:30" },
  ]},
  { key:"sustancias", icon:"🚭", name:"Sustancias", fields:[
    { label:"Cigarrillos (0=ninguno)", type:"range", min:0, max:20, val:0 },
    { label:"Alcohol (unidades)",      type:"range", min:0, max:10, val:0 },
    { label:"Nota", type:"text", placeholder:"Opcional" },
  ]},
  { key:"estres",     icon:"🧘", name:"Estrés",     fields:[
    { label:"Nivel de estrés (1-10)",        type:"range", min:1, max:10, val:4 },
    { label:"Minutos meditación/respiración",type:"range", min:0, max:60, val:10 },
    { label:"¿Cómo te sentiste?", type:"text", placeholder:"Ej: ansioso pero mejor" },
  ]},
  { key:"conexion",   icon:"❤️", name:"Conexión",   fields:[
    { label:"Conexión social (1-10)",        type:"range", min:1, max:10, val:7 },
    { label:"Minutos actividad con propósito",type:"range",min:0, max:120,val:20 },
    { label:"Momento destacado", type:"text", placeholder:"Ej: cené con familia" },
  ]},
];

const inp = { width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid #ddd", fontSize:14, marginBottom:14, boxSizing:"border-box", outline:"none", background:"#fff" };
const btnStyle = (color="#1D9E75") => ({ width:"100%", padding:"12px 0", background:color, color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", marginTop:8 });

// ── LOGIN ─────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── INICIAR SESIÓN ──────────────────────────────────────────────────────
  const doLogin = async () => {
    if (!email || !password) {
      setError("Completa email y contraseña");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const { data, error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    onLogin(
      data.user,
      prof || {
        role: "patient",
        full_name: email.split("@")[0],
        onboarding_done: false,
      }
    );

    setLoading(false);
  };

  // ── REGISTRARSE ─────────────────────────────────────────────────────────
  const doRegister = async () => {
    if (!email || !password || !name) {
      setError("Completa todos los campos");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        role,
        full_name: name,
        email,
        onboarding_done: false,
      });
    }

    setSuccess("¡Cuenta creada! Ahora inicia sesión.");
    setMode("login");
    setLoading(false);
  };

  // ── RECUPERAR CONTRASEÑA ────────────────────────────────────────────────
  const doForgotPassword = async () => {
    setError("");
    setSuccess("");

    if (!email) {
      setError("Ingresa tu email para recuperar tu contraseña.");
      return;
    }

    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "https://med-app-beta-five.vercel.app/?resetPassword=true",
    });

    if (err) {
      setError(err.message);
    } else {
      setSuccess(
        "Te enviamos un correo para recuperar tu contraseña 📩"
      );
    }

    setLoading(false);
  };

  // ── ENTER ────────────────────────────────────────────────────────────────
  const handleEnter = (e) => {
    if (e.key !== "Enter") return;

    if (mode === "login") {
      doLogin();
    } else {
      doRegister();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f7f4",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "36px 28px",
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* LOGO */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontSize: 36,
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
              marginTop: 6,
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
          {["login", "register"].map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError("");
                setSuccess("");
              }}
              style={{
                flex: 1,
                padding: "11px 0",
                fontSize: 14,
                border: "none",
                cursor: "pointer",
                background: mode === m ? "#1D9E75" : "transparent",
                color: mode === m ? "#fff" : "#888",
                fontWeight: mode === m ? 700 : 400,
              }}
            >
              {m === "login" ? "Iniciar sesión" : "Registrarse"}
            </button>
          ))}
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

        {/* CAMPOS REGISTRO */}
        {mode === "register" && (
          <>
            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Nombre completo
            </div>

            <input
              style={inp}
              placeholder="Tu nombre completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 8,
                fontWeight: 500,
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
              {["patient", "doctor"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1,
                    padding: "11px 0",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 10,
                    border: `2px solid ${
                      role === r ? "#1D9E75" : "#eee"
                    }`,
                    background:
                      role === r ? "#E1F5EE" : "transparent",
                    color:
                      role === r ? "#085041" : "#888",
                    fontWeight: role === r ? 700 : 400,
                  }}
                >
                  {r === "patient"
                    ? "🧑 Paciente"
                    : "👨‍⚕️ Doctor"}
                </button>
              ))}
            </div>
          </>
        )}

        {/* EMAIL */}
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          Email
        </div>

        <input
          style={inp}
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleEnter}
        />

        {/* CONTRASEÑA */}
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          Contraseña
        </div>

        <input
          style={{
            ...inp,
            marginBottom: mode === "login" ? 8 : 14,
          }}
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleEnter}
        />

        {/* OLVIDÉ CONTRASEÑA */}
        {mode === "login" && (
          <button
            type="button"
            onClick={doForgotPassword}
            disabled={loading}
            style={{
              display: "block",
              marginLeft: "auto",
              marginBottom: 14,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#1D9E75",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {/* BOTÓN PRINCIPAL */}
        <button
          onClick={
            mode === "login"
              ? doLogin
              : doRegister
          }
          disabled={loading}
          style={btnStyle(
            loading ? "#aaa" : "#1D9E75"
          )}
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

// ── ONBOARDING ────────────────────────────────────────────────────────────
function Onboarding({ user, profile, onDone }) {
  const isDoctor = profile?.role === "doctor";

  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");

  const [form, setForm] = useState({
    age:"", sex:"", weight:"", height:"", body_fat:"",
    risk_hta:false, risk_dm2:false, risk_dislipidemia:false,
  });

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    if (!isDoctor) {
      supabase.from("profiles")
        .select("id, full_name")
        .eq("role","doctor")
        .then(({data}) => setDoctors(data || []));
    }
  }, []);

  const steps = [
    { title:"Cuéntanos de ti", subtitle:"Paso 1 de 4" },
    { title:"Tu cuerpo", subtitle:"Paso 2 de 4" },
    { title:"Salud", subtitle:"Paso 3 de 4" },
    { title:"Tu médico", subtitle:"Paso 4 de 4" },
  ];

  const canNext = () => {
    if(step===0) return form.age && form.sex;
    if(step===1) return form.weight && form.height;
    if(step===3) return selectedDoctor;
    return true;
  };

  const finish = async () => {
    setSaving(true);

    const updates = {
      age: Number(form.age)||null,
      sex: form.sex||null,
      weight: Number(form.weight)||null,
      height: Number(form.height)||null,
      body_fat: Number(form.body_fat)||null,
      risk_hta: form.risk_hta,
      risk_dm2: form.risk_dm2,
      risk_dislipidemia: form.risk_dislipidemia,
      onboarding_done: true,
    };

    await supabase.from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (selectedDoctor) {
      await supabase.from("doctor_patients").insert({
        doctor_id: selectedDoctor,
        patient_id: user.id
      });
    }

    setSaving(false);

    onDone({
      ...profile,
      ...updates,
      onboarding_done:true
    });
  };

  const Card = ({active, onClick, children}) => (
    <div onClick={onClick}
      style={{
        padding:16,
        borderRadius:14,
        border:`2px solid ${active?"#1D9E75":"#eee"}`,
        background:active?"#E1F5EE":"#fff",
        cursor:"pointer"
      }}>
      {children}
    </div>
  );

  return (
    <div style={{
      minHeight:"100vh",
      background:"#f0f7f4",
      display:"flex",
      flexDirection:"column",
      justifyContent:"center",
      padding:16
    }}>

      <div style={{
        maxWidth:420,
        margin:"0 auto",
        width:"100%"
      }}>

        {/* HEADER */}
        <div style={{ marginBottom:30 }}>
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            {steps.map((_,i)=>(
              <div key={i}
                style={{
                  flex:1,
                  height:4,
                  borderRadius:2,
                  background:i<=step?"#1D9E75":"#ddd"
                }}
              />
            ))}
          </div>

          <div style={{ fontSize:13, color:"#888" }}>
            {steps[step].subtitle}
          </div>

          <div style={{ fontSize:26, fontWeight:800 }}>
            {steps[step].title}
          </div>
        </div>

        {/* STEP 0 */}
        {step===0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <input
              style={inp}
              type="number"
              placeholder="Edad"
              value={form.age}
              onChange={e=>set("age",e.target.value)}
            />

            <div style={{ display:"flex", gap:10 }}>
              {[
                {v:"M", label:"👨 Hombre"},
                {v:"F", label:"👩 Mujer"}
              ].map(s=>(
                <Card
                  key={s.v}
                  active={form.sex===s.v}
                  onClick={()=>set("sex",s.v)}
                >
                  {s.label}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1 */}
        {step===1 && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <input
              style={inp}
              placeholder="Peso (kg)"
              value={form.weight}
              onChange={e=>set("weight",e.target.value)}
            />

            <input
              style={inp}
              placeholder="Altura (cm)"
              value={form.height}
              onChange={e=>set("height",e.target.value)}
            />

            <input
              style={inp}
              placeholder="% grasa (opcional)"
              value={form.body_fat}
              onChange={e=>set("body_fat",e.target.value)}
            />
          </div>
        )}

        {/* STEP 2 */}
        {step===2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[
              ["HTA","risk_hta"],
              ["Diabetes","risk_dm2"],
              ["Colesterol","risk_dislipidemia"]
            ].map(([label, field])=>(
              <Card
                key={field}
                active={form[field]}
                onClick={()=>set(field,!form[field])}
              >
                ⚠️ {label}
              </Card>
            ))}
          </div>
        )}

        {/* STEP 3 */}
        {step===3 && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {doctors.map(d=>(
              <Card
                key={d.id}
                active={selectedDoctor===d.id}
                onClick={()=>setSelectedDoctor(d.id)}
              >
                👨‍⚕️ {d.full_name}
              </Card>
            ))}
          </div>
        )}

      </div>

      {/* BOTONES */}
      <div style={{
        position:"sticky",
        bottom:0,
        padding:16,
        background:"#f0f7f4"
      }}>
        <div style={{ maxWidth:420, margin:"0 auto" }}>
          <div style={{ display:"flex", gap:10 }}>
            
            {step>0 && (
              <button
                onClick={()=>setStep(s=>s-1)}
                style={{
                  flex:1,
                  padding:14,
                  borderRadius:12,
                  border:"1px solid #ddd",
                  background:"#fff",
                  fontWeight:600
                }}
              >
                Atrás
              </button>
            )}

            {step < 3 ? (
              <button
                onClick={()=>canNext() && setStep(s=>s+1)}
                style={{
                  flex:2,
                  padding:14,
                  borderRadius:12,
                  border:"none",
                  background: canNext() ? "#1D9E75" : "#ccc",
                  color:"#fff",
                  fontWeight:700
                }}
              >
                Continuar →
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                style={{
                  flex:2,
                  padding:14,
                  borderRadius:12,
                  border:"none",
                  background:"#1D9E75",
                  color:"#fff",
                  fontWeight:700
                }}
              >
                {saving ? "Guardando..." : "Empezar 🚀"}
              </button>
            )}

          </div>
        </div>
      </div>

    </div>
  );
}

// ── SHARED ────────────────────────────────────────────────────────────────
function ScoreBar({ score, color }) {
  return (
    <div style={{ height:4, borderRadius:2, background:"#eee", overflow:"hidden", marginTop:6 }}>
      <div style={{ height:"100%", width:`${Math.min(100,score||0)}%`, background:color, borderRadius:2 }} />
    </div>
  );
}

function PillarModal({ pillar, onClose, onSave }) {
  const [vals, setVals]     = useState(pillar.fields.map(f => f.type==="range" ? f.val : ""));
  const [saving, setSaving] = useState(false);

  const c = COLORS[pillar.key];

  const save = async () => {
    setSaving(true);

    let score;

    // ✅ FIX ESTRÉS (separado, no promedio)
    if (pillar.key === "estres") {
      const nivel = Number(vals[0]);       // 1–10 (alto = malo)
      const meditacion = Number(vals[1]);  // minutos (alto = bueno)

      const nivelScore = ((10 - nivel) / 9) * 100;
      const meditacionScore = Math.min(100, (meditacion / pillar.fields[1].max) * 100);

      score = Math.round((nivelScore * 0.7) + (meditacionScore * 0.3));

    } else {
      // 🔹 lógica normal
      const nums = vals
        .filter((_,i)=>pillar.fields[i].type==="range")
        .map(Number);

      const avg = nums.reduce((a,b)=>a+b,0) / nums.length;

      const invert = ["sustancias"].includes(pillar.key);

      score = invert
        ? Math.min(100, Math.round((1 - avg/10) * 100))
        : Math.min(100, Math.round((avg/10) * 100));
    }

    await onSave(pillar.key, vals, score);

    setSaving(false);
    onClose();
  };

  return (
    <div style={{
      position:"fixed",
      inset:0,
      background:"rgba(0,0,0,0.5)",
      zIndex:300,
      display:"flex",
      alignItems:"flex-end",
      justifyContent:"center"
    }}>
      <div style={{
        background:"#fff",
        borderRadius:"20px 20px 0 0",
        padding:24,
        width:"100%",
        maxWidth:480,
        maxHeight:"88vh",
        overflowY:"auto"
      }}>
        <div style={{ width:40, height:4, background:"#ddd", borderRadius:2, margin:"0 auto 20px" }} />

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontSize:20, fontWeight:700 }}>
            {pillar.icon} {pillar.name}
          </span>
          <button
            onClick={onClose}
            style={{
              border:"none",
              background:"none",
              fontSize:26,
              cursor:"pointer",
              color:"#bbb",
              lineHeight:1
            }}
          >
            ×
          </button>
        </div>

        {pillar.fields.map((f,i)=>(
          <div key={i} style={{ marginBottom:18 }}>
            <div style={{ fontSize:13, color:"#555", marginBottom:8, fontWeight:500 }}>
              {f.label}
            </div>

            {f.type==="range" ? (
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={1}
                  value={vals[i]}
                  onChange={e=>{
                    const v=[...vals];
                    v[i]=Number(e.target.value);
                    setVals(v);
                  }}
                  style={{ flex:1, accentColor:c.main }}
                />
                <span style={{
                  fontWeight:800,
                  minWidth:48,
                  textAlign:"right",
                  fontSize:18,
                  color:c.main
                }}>
                  {vals[i]}
                </span>
              </div>
            ) : (
              <input
                type="text"
                placeholder={f.placeholder}
                value={vals[i]||""}
                onChange={e=>{
                  const v=[...vals];
                  v[i]=e.target.value;
                  setVals(v);
                }}
                style={{
                  width:"100%",
                  padding:"10px 12px",
                  borderRadius:10,
                  border:"1px solid #ddd",
                  fontSize:14,
                  boxSizing:"border-box"
                }}
              />
            )}
          </div>
        ))}

        <button
          onClick={save}
          disabled={saving}
          style={{
            width:"100%",
            padding:14,
            background:saving?"#aaa":c.main,
            color:"#fff",
            border:"none",
            borderRadius:12,
            fontSize:16,
            fontWeight:700,
            cursor:"pointer",
            marginTop:4
          }}
        >
          {saving ? "Guardando..." : "Guardar registro ✓"}
        </button>
      </div>
    </div>
  );
}

// ── PATIENT SCREENS ───────────────────────────────────────────────────────
function Home({ user, profile }) {
  const [records, setRecords] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const TASK_TYPES = {
    medication: {
      label: "Medicamento",
      icon: "💊",
      color: "#534AB7",
      light: "#EEEDFE",
    },
    exercise: {
      label: "Ejercicio",
      icon: "🏃",
      color: "#378ADD",
      light: "#E6F1FB",
    },
    measurement: {
      label: "Medición",
      icon: "🩺",
      color: "#D85A30",
      light: "#FAECE7",
    },
    appointment: {
      label: "Control",
      icon: "📅",
      color: "#BA7517",
      light: "#FAEEDA",
    },
    nutrition: {
      label: "Nutrición",
      icon: "🥗",
      color: "#1D9E75",
      light: "#E1F5EE",
    },
    general: {
      label: "Tarea",
      icon: "📌",
      color: "#666",
      light: "#f0f0f0",
    },
  };

  // =========================================================
  // FECHA LOCAL
  // =========================================================

  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const today = getLocalDateString();

  // =========================================================
  // ¿CORRESPONDE HACER ESTA TAREA HOY?
  // =========================================================

  const isTaskDueToday = (task) => {
    if (!task.active) return false;

    if (task.start_date && today < task.start_date) {
      return false;
    }

    if (task.end_date && today > task.end_date) {
      return false;
    }

    const jsDay = new Date().getDay();
    const dbDay = jsDay === 0 ? 7 : jsDay;

    // Nuestra BD:
    // 1 lunes
    // 2 martes
    // ...
    // 6 sábado
    // 7 domingo

    if (task.frequency === "daily") {
      return true;
    }

    if (task.frequency === "weekdays") {
      return jsDay >= 1 && jsDay <= 5;
    }

    if (task.frequency === "weekly") {
      return (task.days_of_week || []).includes(dbDay);
    }

    if (task.frequency === "once") {
      return task.start_date === today;
    }

    return false;
  };

  // =========================================================
  // CARGAR DATOS
  // =========================================================

  useEffect(() => {
    const load = async () => {
      setLoadingTasks(true);

      // ── Pilares últimos 7 días ────────────────────────────

      const lastWeek = getLocalDateString(
        new Date(Date.now() - 7 * 86400000)
      );

      const { data: rec, error: recError } = await supabase
        .from("pillar_records")
        .select("score,pillar,date")
        .eq("user_id", user.id)
        .gte("date", lastWeek)
        .neq("pillar", "metas");

      if (recError) {
        console.error("Error cargando pilares:", recError);
      }

      setRecords(rec || []);

      // ── Tareas del paciente ───────────────────────────────

      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("patient_id", user.id)
        .eq("active", true)
        .lte("start_date", today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("task_time", {
          ascending: true,
          nullsFirst: false,
        });

      if (taskError) {
        console.error("Error cargando tareas:", taskError);
        setTasks([]);
      } else {
        setTasks(taskData || []);
      }

      // ── Cumplimientos de hoy ──────────────────────────────

      const { data: completionData, error: completionError } =
        await supabase
          .from("task_completions")
          .select("*")
          .eq("patient_id", user.id)
          .eq("completion_date", today);

      if (completionError) {
        console.error(
          "Error cargando cumplimientos:",
          completionError
        );
        setCompletions([]);
      } else {
        setCompletions(completionData || []);
      }

      setLoadingTasks(false);
    };

    load();
  }, [user.id]);

  // =========================================================
  // TAREAS DE HOY
  // =========================================================

  const todayTasks = tasks.filter(isTaskDueToday);

  const isCompleted = (taskId) => {
    return completions.some(
      (c) => c.task_id === taskId && c.completed
    );
  };

  // =========================================================
  // MARCAR / DESMARCAR
  // =========================================================

  const toggleTask = async (task) => {
    const existing = completions.find(
      (c) => c.task_id === task.id
    );

    const currentlyCompleted =
      existing?.completed === true;

    // ── Si ya existe el registro ────────────────────────────

    if (existing) {
      const newCompleted = !currentlyCompleted;

      // UI inmediata
      setCompletions((current) =>
        current.map((c) =>
          c.id === existing.id
            ? {
                ...c,
                completed: newCompleted,
                completed_at: newCompleted
                  ? new Date().toISOString()
                  : null,
              }
            : c
        )
      );

      const { error } = await supabase
        .from("task_completions")
        .update({
          completed: newCompleted,
          completed_at: newCompleted
            ? new Date().toISOString()
            : null,
        })
        .eq("id", existing.id);

      if (error) {
        console.error(
          "Error actualizando cumplimiento:",
          error
        );

        // revertir UI
        setCompletions((current) =>
          current.map((c) =>
            c.id === existing.id
              ? {
                  ...c,
                  completed: currentlyCompleted,
                  completed_at:
                    existing.completed_at,
                }
              : c
          )
        );
      }

      return;
    }

    // ── Si todavía no existe ────────────────────────────────

    const tempId = `temp-${task.id}`;

    const tempCompletion = {
      id: tempId,
      task_id: task.id,
      patient_id: user.id,
      completion_date: today,
      completed: true,
      completed_at: new Date().toISOString(),
    };

    // UI inmediata
    setCompletions((current) => [
      ...current,
      tempCompletion,
    ]);

    const { data, error } = await supabase
      .from("task_completions")
      .insert({
        task_id: task.id,
        patient_id: user.id,
        completion_date: today,
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Error creando cumplimiento:",
        error
      );

      setCompletions((current) =>
        current.filter((c) => c.id !== tempId)
      );

      return;
    }

    // cambiar temporal por fila real
    setCompletions((current) =>
      current.map((c) =>
        c.id === tempId ? data : c
      )
    );
  };

  // =========================================================
  // MÉTRICAS DEL DÍA
  // =========================================================

  const completedToday = todayTasks.filter((task) =>
    isCompleted(task.id)
  ).length;

  const adherenceToday = todayTasks.length
    ? Math.round(
        (completedToday / todayTasks.length) * 100
      )
    : 0;

  // Score de hábitos, separado de adherencia
  const pillarScore = records.length
    ? Math.round(
        records.reduce(
          (sum, r) => sum + (r.score || 0),
          0
        ) / records.length
      )
    : null;

  // =========================================================
  // STREAK DE CUMPLIMIENTO
  // =========================================================

  const nombre =
    profile?.full_name?.split(" ")[0] || "ahí";

  // =========================================================
  // FORMATO FRECUENCIA
  // =========================================================

  const frequencyText = (task) => {
    if (task.frequency === "daily") {
      return "Todos los días";
    }

    if (task.frequency === "weekdays") {
      return "Lunes a viernes";
    }

    if (task.frequency === "once") {
      return "Solo hoy";
    }

    if (task.frequency === "weekly") {
      const names = {
        1: "Lun",
        2: "Mar",
        3: "Mié",
        4: "Jue",
        5: "Vie",
        6: "Sáb",
        7: "Dom",
      };

      return (task.days_of_week || [])
        .map((day) => names[day])
        .join(" · ");
    }

    return "";
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div style={{ padding: 16 }}>

      {/* SALUDO */}

      <div style={{ marginBottom: 22 }}>
        <p
          style={{
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 4,
          }}
        >
          Hola, {nombre} 👋
        </p>

        <p
          style={{
            fontSize: 13,
            color: "#888",
            margin: 0,
          }}
        >
          Este es tu plan para hoy.
        </p>
      </div>

      {/* ================================================= */}
      {/* TU DÍA */}
      {/* ================================================= */}

      <div
        style={{
          background: "#1D9E75",
          borderRadius: 20,
          padding: 20,
          color: "#fff",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                opacity: 0.8,
                marginBottom: 3,
              }}
            >
              Tu día
            </div>

            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              {loadingTasks
                ? "..."
                : todayTasks.length === 0
                ? "Sin tareas"
                : `${completedToday} de ${todayTasks.length}`}
            </div>
          </div>

          {todayTasks.length > 0 && (
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              {adherenceToday}%
            </div>
          )}
        </div>

        {todayTasks.length > 0 && (
          <div
            style={{
              height: 8,
              background: "rgba(255,255,255,0.25)",
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${adherenceToday}%`,
                height: "100%",
                background: "#fff",
                borderRadius: 20,
                transition: "width 0.25s ease",
              }}
            />
          </div>
        )}

        {todayTasks.length > 0 && (
          <div
            style={{
              fontSize: 11,
              opacity: 0.8,
              marginTop: 9,
            }}
          >
            {completedToday === todayTasks.length
              ? "✓ Plan de hoy completado"
              : `${todayTasks.length - completedToday} ${
                  todayTasks.length - completedToday === 1
                    ? "tarea pendiente"
                    : "tareas pendientes"
                }`}
          </div>
        )}
      </div>

      {/* ================================================= */}
      {/* TAREAS */}
      {/* ================================================= */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
          }}
        >
          Hoy
        </p>

        {todayTasks.length > 0 && (
          <span
            style={{
              fontSize: 12,
              color: "#888",
            }}
          >
            {completedToday}/{todayTasks.length}
          </span>
        )}
      </div>

      {loadingTasks ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "#888",
            background: "#f7f7f7",
            borderRadius: 14,
            marginBottom: 22,
          }}
        >
          Cargando tu plan...
        </div>
      ) : todayTasks.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            background: "#f7f7f7",
            borderRadius: 14,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontSize: 28,
              marginBottom: 8,
            }}
          >
            🌿
          </div>

          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No tienes tareas para hoy
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#888",
              marginTop: 4,
            }}
          >
            Tu equipo médico puede agregarlas a tu plan.
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {todayTasks.map((task) => {
            const done = isCompleted(task.id);

            const type =
              TASK_TYPES[task.task_type] ||
              TASK_TYPES.general;

            return (
              <div
                key={task.id}
                onClick={() => toggleTask(task)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  marginBottom: 9,
                  cursor: "pointer",
                  background: done
                    ? type.light
                    : "#fff",
                  border: `1.5px solid ${
                    done
                      ? type.color
                      : "#e8e8e8"
                  }`,
                  transition: "all 0.2s ease",
                }}
              >
                {/* ICONO */}

                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: type.light,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {type.icon}
                </div>

                {/* INFORMACIÓN */}

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: done
                        ? "#777"
                        : "#222",
                      textDecoration: done
                        ? "line-through"
                        : "none",
                    }}
                  >
                    {task.title}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "#888",
                      marginTop: 4,
                    }}
                  >
                    {task.task_time && (
                      <>
                        <span
                          style={{
                            fontWeight: 700,
                            color: type.color,
                          }}
                        >
                          {task.task_time.slice(0, 5)}
                        </span>

                        {" · "}
                      </>
                    )}

                    {frequencyText(task)}
                  </div>

                  {task.instructions && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#666",
                        marginTop: 7,
                        lineHeight: 1.4,
                      }}
                    >
                      {task.instructions}
                    </div>
                  )}
                </div>

                {/* CHECK */}

                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: `2px solid ${
                      done
                        ? type.color
                        : "#ccc"
                    }`,
                    background: done
                      ? type.color
                      : "transparent",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    marginTop: 7,
                  }}
                >
                  {done ? "✓" : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================= */}
      {/* HÁBITOS */}
      {/* ================================================= */}

      <div
        style={{
          borderTop: "1px solid #eee",
          paddingTop: 18,
          marginTop: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              🌱 Hábitos
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#888",
                marginTop: 3,
              }}
            >
              Tu seguimiento de estilo de vida
            </div>
          </div>

          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "#E1F5EE",
              color: "#085041",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            {pillarScore ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pillars({ user }) {
  const [open, setOpen]     = useState(null);
  const [scores, setScores] = useState({});
  const [saved, setSaved]   = useState([]);

  useEffect(()=>{
    const today = new Date().toISOString().split("T")[0];
    supabase.from("pillar_records").select("pillar,score").eq("user_id",user.id).eq("date",today)
      .then(({data})=>{ if(data){ const s={}; data.forEach(r=>{s[r.pillar]=r.score;}); setScores(s); setSaved(data.map(r=>r.pillar)); } });
  },[user.id]);

  const handleSave = async (key,vals,score) => {
    const today = new Date().toISOString().split("T")[0];
    const {error} = await supabase.from("pillar_records").upsert(
      { user_id:user.id, date:today, pillar:key, data:vals, score },
      { onConflict:"user_id,date,pillar" }
    );
    if(!error){ setScores(p=>({...p,[key]:score})); setSaved(p=>[...new Set([...p,key])]); }
  };

  const pillarScores = PILLARS.map(p=>scores[p.key]||0);
  const globalToday  = saved.filter(s=>PILLARS.find(p=>p.key===s)).length
    ? Math.round(pillarScores.reduce((a,b)=>a+b,0)/pillarScores.length) : null;

  const radarData = {
    labels: PILLARS.map(p=>p.name),
    datasets:[{ data:pillarScores, borderColor:"#1D9E75", backgroundColor:"rgba(29,158,117,0.15)", borderWidth:2, pointBackgroundColor:"#1D9E75" }],
  };

  return (
    <div style={{ padding:16 }}>
      {open && <PillarModal pillar={open} onClose={()=>setOpen(null)} onSave={handleSave} />}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <p style={{ fontSize:15, fontWeight:700, margin:0 }}>Registra tus pilares</p>
        {globalToday && <span style={{ fontSize:13, fontWeight:700, color:"#1D9E75" }}>Hoy: {globalToday}</span>}
      </div>
      <p style={{ fontSize:12, color:"#888", marginBottom:16 }}>Toca un pilar para registrar · {saved.filter(s=>PILLARS.find(p=>p.key===s)).length}/6 completados</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
        {PILLARS.map(p=>(
          <div key={p.key} onClick={()=>setOpen(p)}
            style={{ border:`2px solid ${saved.includes(p.key)?COLORS[p.key].main:"#eee"}`,
              borderRadius:14, padding:"16px 8px", textAlign:"center", cursor:"pointer",
              background:saved.includes(p.key)?COLORS[p.key].light:"#fff", transition:"all 0.2s" }}>
            <div style={{ fontSize:28, marginBottom:6 }}>{p.icon}</div>
            <div style={{ fontSize:11, fontWeight:600, color:"#444" }}>{p.name}</div>
            <div style={{ fontSize:22, fontWeight:800, color:COLORS[p.key].main, marginTop:4 }}>
              {scores[p.key]!==undefined?scores[p.key]:<span style={{fontSize:14,color:"#ddd"}}>—</span>}
            </div>
            <ScoreBar score={scores[p.key]||0} color={COLORS[p.key].main} />
          </div>
        ))}
      </div>
      <div style={{ background:"#f7f7f7", borderRadius:14, padding:16 }}>
        <p style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Radar de hoy</p>
        <Radar data={radarData} options={{ responsive:true,
          scales:{ r:{ min:0, max:100, ticks:{ stepSize:25, font:{size:9} } } },
          plugins:{ legend:{ display:false } } }} />
      </div>
    </div>
  );
}

function Plans({ user }) {
  const [goals, setGoals] = useState([]);

  useEffect(()=>{
    supabase.from("goals").select("*").eq("patient_id", user.id).order("created_at",{ascending:false})
      .then(({data})=>setGoals(data||[]));
  },[user.id]);

  const toggleGoal = async (goal) => {
    const {error} = await supabase.from("goals").update({done:!goal.done}).eq("id",goal.id);
    if(!error) setGoals(g=>g.map(x=>x.id===goal.id?{...x,done:!x.done}:x));
  };

  const pillarColors = { nutricion:"nutricion", actividad:"actividad", sueno:"sueno", sustancias:"sustancias", estres:"estres", conexion:"conexion" };
  const pillarIcons  = { nutricion:"🥗", actividad:"🏃", sueno:"🌙", sustancias:"🚭", estres:"🧘", conexion:"❤️" };

  return (
    <div style={{ padding:16 }}>
      <p style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Metas de tu médico</p>
      <p style={{ fontSize:12, color:"#888", marginBottom:16 }}>Metas asignadas por tu equipo clínico</p>
      {goals.length===0
        ? <div style={{ textAlign:"center", padding:40, background:"#f7f7f7", borderRadius:14, color:"#888", fontSize:13 }}>
            Aún no tienes metas asignadas. Tu médico las agregará pronto.
          </div>
        : goals.map(goal=>{
            const color = pillarColors[goal.pillar]||"actividad";
            const icon  = pillarIcons[goal.pillar]||"📌";
            return (
              <div key={goal.id} onClick={()=>toggleGoal(goal)}
                style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"14px", background:"#f7f7f7",
                  borderRadius:12, marginBottom:8, cursor:"pointer",
                  border:`1.5px solid ${goal.done?COLORS[color].main:"#eee"}`,
                  background:goal.done?COLORS[color].light:"#f7f7f7" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                  border:`2px solid ${goal.done?COLORS[color].main:"#ccc"}`,
                  background:goal.done?COLORS[color].main:"transparent", color:"#fff", fontSize:13, marginTop:1 }}>
                  {goal.done?"✓":""}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, textDecoration:goal.done?"line-through":"none", color:goal.done?"#aaa":"inherit" }}>
                    {icon} {goal.description}
                  </div>
                  <div style={{ fontSize:11, color:"#888", marginTop:4 }}>
                    <span style={{ padding:"2px 8px", borderRadius:20, background:COLORS[color].light, color:COLORS[color].dark }}>
                      {goal.pillar}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

function Progress({ user, profile }) {
  const [records, setRecords] = useState([]);

  useEffect(()=>{
    supabase.from("pillar_records").select("*").eq("user_id",user.id).neq("pillar","metas").order("date",{ascending:true})
      .then(({data})=>setRecords(data||[]));
  },[user.id]);

  const byDate={};
  records.forEach(r=>{ if(!byDate[r.date])byDate[r.date]=[]; byDate[r.date].push(r); });
  const dates       = Object.keys(byDate).slice(-7);
  const dailyScores = dates.map(d=>Math.round(byDate[d].reduce((a,r)=>a+(r.score||0),0)/byDate[d].length));
  const pillarAvgs  = PILLARS.map(p=>{ const pr=records.filter(r=>r.pillar===p.key); return pr.length?Math.round(pr.reduce((a,r)=>a+(r.score||0),0)/pr.length):0; });
  const opts        = { responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ min:0, max:100 } } };
  const imc         = profile?.weight&&profile?.height ? (Number(profile.weight)/Math.pow(Number(profile.height)/100,2)).toFixed(1) : "—";

  return (
    <div style={{ padding:16 }}>
      <p style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Score global</p>
      {dates.length>0
        ? <div style={{ background:"#f7f7f7", borderRadius:14, padding:16, marginBottom:16 }}>
            <Line data={{ labels:dates.map(d=>d.slice(5)),
              datasets:[{ data:dailyScores, borderColor:"#1D9E75", backgroundColor:"rgba(29,158,117,0.1)",
                borderWidth:2.5, tension:0.4, fill:true, pointBackgroundColor:"#1D9E75", pointRadius:5 }] }} options={opts} />
          </div>
        : <div style={{ background:"#f7f7f7", borderRadius:14, padding:32, marginBottom:16, textAlign:"center", color:"#888", fontSize:13 }}>
            Aún no hay datos. ¡Registra tus pilares!
          </div>
      }
      <p style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Promedio por pilar</p>
      <div style={{ background:"#f7f7f7", borderRadius:14, padding:16, marginBottom:16 }}>
        <Bar data={{ labels:PILLARS.map(p=>p.name),
          datasets:[{ data:pillarAvgs, backgroundColor:PILLARS.map(p=>COLORS[p.key].main), borderRadius:6 }] }} options={opts} />
      </div>
      <p style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Datos clínicos</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        {[[imc,"IMC"],[profile?.body_fat?`${profile.body_fat}%`:"—","% grasa"],[profile?.weight?`${profile.weight} kg`:"—","Peso"],[profile?.height?`${profile.height} cm`:"—","Estatura"]].map(([v,l])=>(
          <div key={l} style={{ background:"#f7f7f7", borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:20, fontWeight:800 }}>{v}</div>
            <div style={{ fontSize:12, color:"#888" }}>{l}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize:15, fontWeight:700, marginBottom:10 }}>Factores de riesgo</p>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {[[profile?.risk_hta,"HTA","estres"],[profile?.risk_dm2,"DM2","sustancias"],[profile?.risk_dislipidemia,"Dislipidemia","actividad"]].map(([val,label,color])=>(
          <span key={label} style={{ padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:600,
            background:val?COLORS[color].light:"#f0f0f0", color:val?COLORS[color].dark:"#aaa" }}>
            {val?"⚠️ ":"✓ "}{label}
          </span>
        ))}
      </div>
    </div>
  );
}
function Achievements({ user }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("pillar_records")
        .select("date")
        .eq("user_id", user.id);

      if (!error) setRecords(data || []);
      setLoading(false);
    };

    load();
  }, [user?.id]);

  const getStreak = (records) => {
    if (!records.length) return 0;

    const dates = [...new Set(records.map(r => r.date))]
      .sort()
      .reverse();

    let streak = 0;
    let current = new Date();

    for (let d of dates) {
      const date = new Date(d);
      const diff = Math.floor((current - date) / (1000 * 60 * 60 * 24));

      if (diff === streak) streak++;
      else break;
    }

    return streak;
  };

  const streak = getStreak(records);
  const points = records.length * 10;

  const achievements = [
    { title:"Primer registro", unlocked: records.length >= 1 },
    { title:"3 días seguidos", unlocked: streak >= 3 },
    { title:"7 días seguidos", unlocked: streak >= 7 },
    { title:"100 puntos", unlocked: points >= 100 },
  ];

  if (loading) {
    return <div style={{ padding:16 }}>Cargando...</div>;
  }

  return (
    <div style={{ padding:16 }}>
      <p style={{ fontWeight:700, marginBottom:12 }}>Logros</p>

      {achievements.map((a,i)=>(
        <div key={i}
          style={{
            padding:12,
            borderRadius:10,
            marginBottom:8,
            background: a.unlocked ? "#E1F5EE" : "#f0f0f0",
            color: a.unlocked ? "#085041" : "#aaa"
          }}>
          {a.unlocked ? "🏅" : "🔒"} {a.title}
        </div>
      ))}
    </div>
  );
}

function Profile({ user, profile }) {
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    age: profile.age || "",
    weight: profile.weight || "",
    height: profile.height || "",
    body_fat: profile.body_fat || "",
  });

  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");

  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
    useEffect(() => {
    const loadDoctors = async () => {
      // traer doctores
      const { data: docs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "doctor");

      setDoctors(docs || []);

      // traer doctor actual del paciente
      const { data: rel } = await supabase
        .from("doctor_patients")
        .select("doctor_id")
        .eq("patient_id", user.id)
        .maybeSingle();

      if (rel) setSelectedDoctor(rel.doctor_id);
    };

    loadDoctors();
  }, [user.id]);
  const save = async () => {
    setSaving(true);

    await supabase.from("profiles").update({
      full_name: form.full_name,
      age: Number(form.age) || null,
      weight: Number(form.weight) || null,
      height: Number(form.height) || null,
      body_fat: Number(form.body_fat) || null,
    }).eq("id", user.id);

    setSaving(false);
    alert("Guardado ✅");
  };

  return (
    <div style={{ padding:16 }}>
      <p style={{ fontSize:18, fontWeight:700, marginBottom:12 }}>
        Perfil
      </p>

      <div style={{ background:"#f7f7f7", borderRadius:12, padding:14 }}>
        <input
          style={inp}
          value={form.full_name}
          onChange={e=>set("full_name", e.target.value)}
          placeholder="Nombre"
        />

        <input
          style={inp}
          type="number"
          value={form.age}
          onChange={e=>set("age", e.target.value)}
          placeholder="Edad"
        />

        <input
          style={inp}
          value={form.weight}
          onChange={e=>set("weight", e.target.value)}
          placeholder="Peso"
        />

        <input
          style={inp}
          value={form.height}
          onChange={e=>set("height", e.target.value)}
          placeholder="Altura"
        />

        <input
          style={inp}
          value={form.body_fat}
          onChange={e=>set("body_fat", e.target.value)}
          placeholder="% grasa corporal"
        />

        <div style={{ marginBottom:10 }}>
  <div style={{ fontSize:12, color:"#666", marginBottom:6, fontWeight:500 }}>
    Doctor
  </div>

  <select
    value={selectedDoctor}
    onChange={(e)=>setSelectedDoctor(e.target.value)}
    style={{
      ...inp,
      border: selectedDoctor ? "2px solid #1D9E75" : "1px solid #ddd"
    }}
  >
    <option value="">Selecciona tu doctor</option>

    {doctors.map(d => (
      <option key={d.id} value={d.id}>
        {d.full_name}
      </option>
    ))}
  </select>
</div>

        <button
          onClick={save}
          disabled={saving}
          style={btnStyle(saving ? "#aaa" : "#1D9E75")}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
// ── DOCTOR SCREENS ────────────────────────────────────────────────────────
function DocDashboard({ doctorId }) {
  const [patients, setPatients] = useState([]);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const load = async () => {
      // 1. relaciones doctor-paciente
      const { data: relations } = await supabase
        .from("doctor_patients")
        .select("patient_id")
        .eq("doctor_id", doctorId);

      const ids = (relations || []).map(r => r.patient_id);

      if (ids.length === 0) return;

      // 2. pacientes
      const { data: pats } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);

      setPatients(pats || []);

      // 3. registros últimos 7 días
      const lastWeek = new Date(Date.now() - 7*86400000)
        .toISOString().split("T")[0];

      const { data: rec } = await supabase
        .from("pillar_records")
        .select("user_id, score, date")
        .in("user_id", ids)
        .gte("date", lastWeek);

      setRecords(rec || []);
    };

    load();
  }, [doctorId]);

  // 🧠 helpers
  const getPatientStats = (id) => {
    const r = records.filter(x => x.user_id === id);

    if (r.length === 0) {
      return {
        avg: 0,
        lastDays: 999,
        trend: 0
      };
    }

    const avg = Math.round(
      r.reduce((a,b)=>a+(b.score||0),0) / r.length
    );

    const lastDate = new Date(
      r.sort((a,b)=>new Date(b.date)-new Date(a.date))[0].date
    );

    const daysAgo = Math.floor(
      (new Date() - lastDate) / (1000*60*60*24)
    );

    // tendencia simple (últimos vs primeros)
    const first = r[0]?.score || 0;
    const last  = r[r.length-1]?.score || 0;
    const trend = last - first;

    return { avg, lastDays: daysAgo, trend };
  };

  // 🔥 clasificación
  const enriched = patients.map(p => {
    const stats = getPatientStats(p.id);

    let risk = "low";
    if (stats.avg < 60 || stats.lastDays >= 3) risk = "high";
    else if (stats.avg < 75) risk = "mid";

    return { ...p, ...stats, risk };
  });

  const highRisk = enriched.filter(p => p.risk === "high");
  const inactive = enriched.filter(p => p.lastDays >= 3);

  const activeRate = patients.length
    ? Math.round(((patients.length - inactive.length) / patients.length) * 100)
    : 0;

  const avgScore = enriched.length
    ? Math.round(enriched.reduce((a,b)=>a+b.avg,0) / enriched.length)
    : 0;

  return (
    <div style={{ padding:16 }}>

      <p style={{ fontSize:22, fontWeight:800 }}>
        Panel clínico
      </p>

      {/* 🔥 KPIs */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"1fr 1fr",
        gap:10,
        marginBottom:20
      }}>
        <div style={{ background:"#f7f7f7", padding:16, borderRadius:12 }}>
          <div style={{ fontSize:28, fontWeight:800 }}>
            {avgScore}
          </div>
          <div style={{ fontSize:12, color:"#888" }}>
            Score promedio
          </div>
        </div>

        <div style={{ background:"#f7f7f7", padding:16, borderRadius:12 }}>
          <div style={{ fontSize:28, fontWeight:800 }}>
            {activeRate}%
          </div>
          <div style={{ fontSize:12, color:"#888" }}>
            Pacientes activos
          </div>
        </div>
      </div>

      {/* 🚨 PACIENTES EN RIESGO */}
      <p style={{ fontWeight:700, marginBottom:8 }}>
        ⚠️ Pacientes en riesgo
      </p>

      {highRisk.length === 0 ? (
        <p style={{ color:"#888", marginBottom:16 }}>
          Todo bajo control 🙌
        </p>
      ) : (
        highRisk.slice(0,5).map(p => (
          <div key={p.id}
            style={{
              padding:12,
              borderRadius:10,
              marginBottom:8,
              background:"#FAECE7",
              border:"1px solid #D85A30"
            }}>
            <div style={{ fontWeight:600 }}>
              {p.full_name}
            </div>
            <div style={{ fontSize:12 }}>
              Score {p.avg} · hace {p.lastDays} días
            </div>
          </div>
        ))
      )}

      {/* ⏳ INACTIVOS */}
      <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>
        ⏳ Sin actividad
      </p>

      {inactive.length === 0 ? (
        <p style={{ color:"#888" }}>
          Todos activos 💪
        </p>
      ) : (
        inactive.slice(0,5).map(p => (
          <div key={p.id}
            style={{
              padding:12,
              borderRadius:10,
              marginBottom:8,
              background:"#f7f7f7"
            }}>
            {p.full_name} · {p.lastDays} días
          </div>
        ))
      )}

      {/* 📊 RANKING */}
      <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>
        🏆 Mejores pacientes
      </p>

      {enriched
        .sort((a,b)=>b.avg-a.avg)
        .slice(0,5)
        .map(p=>(
          <div key={p.id}
            style={{
              padding:12,
              borderRadius:10,
              marginBottom:8,
              background:"#E1F5EE"
            }}>
            {p.full_name} · {p.avg}
          </div>
        ))
      }

    </div>
  );
}

function DocPatients({ doctorId }) {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [recs, setRecs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskCompletions, setTaskCompletions] = useState([]);
  const [addingTask, setAddingTask] = useState(false);
  const [taskError, setTaskError] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const emptyTask = {
    task_type: "medication",
    title: "",
    description: "",
    frequency: "daily",
    days_of_week: [],
    task_time: "",
    start_date: today,
    end_date: "",
    instructions: "",
  };

  const [newTask, setNewTask] = useState(emptyTask);

  const TASK_TYPES = {
    medication: { label: "Medicamento", icon: "💊" },
    exercise: { label: "Ejercicio", icon: "🏃" },
    measurement: { label: "Medición", icon: "🩺" },
    appointment: { label: "Control / cita", icon: "📅" },
    nutrition: { label: "Nutrición", icon: "🥗" },
    general: { label: "Otra tarea", icon: "📌" },
  };

  const FREQUENCIES = {
    daily: "Todos los días",
    weekdays: "Lunes a viernes",
    weekly: "Días específicos",
    once: "Una vez",
  };

  const WEEK_DAYS = [
    { value: 1, label: "L" },
    { value: 2, label: "M" },
    { value: 3, label: "X" },
    { value: 4, label: "J" },
    { value: 5, label: "V" },
    { value: 6, label: "S" },
    { value: 7, label: "D" },
  ];

  // ── CARGAR PACIENTES ────────────────────────────────────────────────────
  useEffect(() => {
    const loadPatients = async () => {
      const { data: relations, error: relationError } = await supabase
        .from("doctor_patients")
        .select("patient_id")
        .eq("doctor_id", doctorId);

      if (relationError) {
        console.error("Error cargando relaciones:", relationError);
        return;
      }

      const ids = (relations || []).map((r) => r.patient_id);

      if (ids.length === 0) {
        setPatients([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);

      if (error) {
        console.error("Error cargando pacientes:", error);
        return;
      }

      setPatients(data || []);
    };

    loadPatients();
  }, [doctorId]);

  // ── ABRIR PACIENTE ──────────────────────────────────────────────────────
  const open = async (pt) => {
    setSelected(pt);
    setTaskError("");

    const formatLocalDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(12, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const startDate = formatLocalDate(sevenDaysAgo);

    const [
      { data: r, error: recError },
      { data: t, error: taskLoadError },
      { data: c, error: completionError },
    ] = await Promise.all([
      supabase
        .from("pillar_records")
        .select("*")
        .eq("user_id", pt.id)
        .order("date", { ascending: false })
        .limit(60),

      supabase
        .from("tasks")
        .select("*")
        .eq("patient_id", pt.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("task_completions")
        .select("*")
        .eq("patient_id", pt.id)
        .gte("completion_date", startDate),
    ]);

    if (recError) {
      console.error("Error cargando registros:", recError);
    }

    if (taskLoadError) {
      console.error("Error cargando tareas:", taskLoadError);
      setTaskError("No se pudieron cargar las tareas.");
    }

    if (completionError) {
      console.error("Error cargando cumplimientos:", completionError);
    }

    setRecs(r || []);
    setTasks(t || []);
    setTaskCompletions(c || []);

    setNewTask({
      ...emptyTask,
      start_date: formatLocalDate(new Date()),
    });
  };

  // ── CREAR TAREA ─────────────────────────────────────────────────────────
  const addTask = async () => {
    setTaskError("");

    if (!selected) return;

    if (!newTask.title.trim()) {
      setTaskError("Escribe un título para la tarea.");
      return;
    }

    if (
      newTask.frequency === "weekly" &&
      newTask.days_of_week.length === 0
    ) {
      setTaskError("Selecciona al menos un día de la semana.");
      return;
    }

    if (
      newTask.end_date &&
      newTask.start_date &&
      newTask.end_date < newTask.start_date
    ) {
      setTaskError(
        "La fecha de término no puede ser anterior a la fecha de inicio."
      );
      return;
    }

    setAddingTask(true);

    const payload = {
      patient_id: selected.id,
      doctor_id: doctorId,
      title: newTask.title.trim(),
      description: newTask.description.trim() || null,
      task_type: newTask.task_type,
      frequency: newTask.frequency,

      days_of_week:
        newTask.frequency === "weekly"
          ? newTask.days_of_week
          : null,

      task_time: newTask.task_time || null,
      start_date: newTask.start_date,
      end_date: newTask.end_date || null,
      instructions: newTask.instructions.trim() || null,
      active: true,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error creando tarea:", error);
      setTaskError(`No se pudo crear la tarea: ${error.message}`);
      setAddingTask(false);
      return;
    }

    setTasks((current) => [data, ...current]);

    setNewTask({
      ...emptyTask,
      start_date: new Date().toISOString().split("T")[0],
    });

    setAddingTask(false);
  };

  // ── ACTIVAR / PAUSAR ────────────────────────────────────────────────────
  const toggleTaskActive = async (task) => {
    const newActive = !task.active;

    const { error } = await supabase
      .from("tasks")
      .update({ active: newActive })
      .eq("id", task.id);

    if (error) {
      console.error("Error actualizando tarea:", error);
      setTaskError("No se pudo actualizar la tarea.");
      return;
    }

    setTasks((current) =>
      current.map((t) =>
        t.id === task.id ? { ...t, active: newActive } : t
      )
    );
  };

  // ── ELIMINAR TAREA ──────────────────────────────────────────────────────
  const deleteTask = async (id) => {
    const ok = window.confirm(
      "¿Seguro que quieres eliminar esta tarea?"
    );

    if (!ok) return;

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error eliminando tarea:", error);
      setTaskError("No se pudo eliminar la tarea.");
      return;
    }

    setTasks((current) => current.filter((t) => t.id !== id));
  };

  // ── DÍAS SEMANA ─────────────────────────────────────────────────────────
  const toggleWeekDay = (day) => {
    setNewTask((current) => {
      const exists = current.days_of_week.includes(day);

      return {
        ...current,
        days_of_week: exists
          ? current.days_of_week.filter((d) => d !== day)
          : [...current.days_of_week, day],
      };
    });
  };

  // ── TEXTO FRECUENCIA ────────────────────────────────────────────────────
  const getFrequencyText = (task) => {
    if (task.frequency === "daily") {
      return "Todos los días";
    }

    if (task.frequency === "weekdays") {
      return "Lunes a viernes";
    }

    if (task.frequency === "once") {
      return `Una vez · ${task.start_date}`;
    }

    if (task.frequency === "weekly") {
      const names = {
        1: "Lun",
        2: "Mar",
        3: "Mié",
        4: "Jue",
        5: "Vie",
        6: "Sáb",
        7: "Dom",
      };

      return (task.days_of_week || [])
        .map((d) => names[d])
        .join(" · ");
    }

    return "";
  };

  // ── DETALLE PACIENTE ────────────────────────────────────────────────────
  if (selected) {
    const avg = recs.length
      ? Math.round(
          recs.reduce((a, r) => a + (r.score || 0), 0) /
            recs.length
        )
      : 0;

    const avgs = PILLARS.map((p) => {
      const pr = recs.filter((r) => r.pillar === p.key);

      return pr.length
        ? Math.round(
            pr.reduce((a, r) => a + (r.score || 0), 0) /
              pr.length
          )
        : 0;
    });

    const ini = (selected.full_name || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const imc =
      selected.weight && selected.height
        ? (
            Number(selected.weight) /
            Math.pow(Number(selected.height) / 100, 2)
          ).toFixed(1)
        : "—";

    const activeTasks = tasks.filter((t) => t.active);
    const inactiveTasks = tasks.filter((t) => !t.active);

    // ── ADHERENCIA ÚLTIMOS 7 DÍAS ─────────────────────────────────────────
    const formatLocalDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const isTaskDueOnDate = (task, date) => {
      const dateString = formatLocalDate(date);

      if (task.start_date && dateString < task.start_date) return false;
      if (task.end_date && dateString > task.end_date) return false;

      const jsDay = date.getDay();
      const dbDay = jsDay === 0 ? 7 : jsDay;

      if (task.frequency === "daily") return true;
      if (task.frequency === "weekdays") return dbDay >= 1 && dbDay <= 5;
      if (task.frequency === "weekly") {
        return (task.days_of_week || []).includes(dbDay);
      }
      if (task.frequency === "once") return task.start_date === dateString;

      return false;
    };

    const adherenceDays = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const dateString = formatLocalDate(date);

      const scheduledTasks = tasks.filter((task) =>
        isTaskDueOnDate(task, date)
      );

      const completedTasks = scheduledTasks.filter((task) =>
        taskCompletions.some(
          (completion) =>
            completion.task_id === task.id &&
            completion.completion_date === dateString &&
            completion.completed === true
        )
      );

      adherenceDays.push({
        date: dateString,
        scheduled: scheduledTasks.length,
        completed: completedTasks.length,
      });
    }

    const totalScheduled = adherenceDays.reduce(
      (sum, day) => sum + day.scheduled,
      0
    );

    const totalCompleted = adherenceDays.reduce(
      (sum, day) => sum + day.completed,
      0
    );

    const adherence7Days =
      totalScheduled > 0
        ? Math.round((totalCompleted / totalScheduled) * 100)
        : null;

    return (
      <div style={{ padding: 16 }}>
        {/* VOLVER */}
        <button
          onClick={() => {
            setSelected(null);
            setRecs([]);
            setTasks([]);
            setTaskCompletions([]);
            setTaskError("");
          }}
          style={{
            border: "none",
            background: "none",
            color: "#888",
            fontSize: 13,
            cursor: "pointer",
            marginBottom: 16,
            padding: 0,
          }}
        >
          ← Volver
        </button>

        {/* PACIENTE */}
        <div
          style={{
            background: "#f7f7f7",
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "#E6F1FB",
              color: "#0C447C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {ini}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>
              {selected.full_name}
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#888",
                marginTop: 2,
              }}
            >
              {selected.age ? `${selected.age}a · ` : ""}
              {selected.sex === "M"
                ? "M"
                : selected.sex === "F"
                ? "F"
                : ""}
            </div>

            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
              }}
            >
              {[
                ["IMC", imc],
                ["%G", selected.body_fat || "—"],
                ["Kg", selected.weight || "—"],
                ["Score", avg || "—"],
              ].map(([l, v]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {v}
                  </div>

                  <div
                    style={{
                      fontSize: 10,
                      color: "#888",
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ADHERENCIA 7 DÍAS */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e8e8",
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Adherencia al plan
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                Últimos 7 días
              </div>
            </div>

            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color:
                  adherence7Days === null
                    ? "#aaa"
                    : adherence7Days >= 80
                    ? "#1D9E75"
                    : adherence7Days >= 50
                    ? "#BA7517"
                    : "#D85A30",
              }}
            >
              {adherence7Days === null ? "—" : `${adherence7Days}%`}
            </div>
          </div>

          <div
            style={{
              height: 7,
              background: "#eee",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${adherence7Days || 0}%`,
                background:
                  adherence7Days === null
                    ? "#ddd"
                    : adherence7Days >= 80
                    ? "#1D9E75"
                    : adherence7Days >= 50
                    ? "#BA7517"
                    : "#D85A30",
                borderRadius: 10,
                transition: "width 0.25s ease",
              }}
            />
          </div>

          <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
            {totalScheduled === 0
              ? "Sin tareas programadas en este período"
              : `${totalCompleted} de ${totalScheduled} tareas completadas`}
          </div>
        </div>

        {/* OBJETIVO */}
        {selected.objective && (
          <div
            style={{
              background: "#E1F5EE",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 13,
              color: "#085041",
            }}
          >
            🎯 {selected.objective}
          </div>
        )}

        {/* RIESGOS */}
        {(selected.risk_hta ||
          selected.risk_dm2 ||
          selected.risk_dislipidemia) && (
          <div
            style={{
              background: "#FAECE7",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 12,
              color: "#4A1B0C",
            }}
          >
            ⚠️{" "}
            {[
              selected.risk_hta && "HTA",
              selected.risk_dm2 && "DM2",
              selected.risk_dislipidemia &&
                "Dislipidemia",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}

        {/* PILARES */}
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Pilares (promedio)
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {PILLARS.map((p, i) => (
            <div
              key={p.key}
              style={{
                background: "#f7f7f7",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {p.icon} {p.name}
                </span>

                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: COLORS[p.key].main,
                  }}
                >
                  {avgs[i] || "—"}
                </span>
              </div>

              <ScoreBar
                score={avgs[i] || 0}
                color={COLORS[p.key].main}
              />
            </div>
          ))}
        </div>

        {/* ───────────────────────────────────────────── */}
        {/* CREAR TAREA */}
        {/* ───────────────────────────────────────────── */}

        <p
          style={{
            fontSize: 18,
            fontWeight: 800,
            marginBottom: 4,
          }}
        >
          Plan del paciente
        </p>

        <p
          style={{
            fontSize: 12,
            color: "#888",
            marginTop: 0,
            marginBottom: 12,
          }}
        >
          Asigna medicamentos, mediciones, ejercicio,
          controles y otras tareas.
        </p>

        <div
          style={{
            background: "#f7f7f7",
            borderRadius: 14,
            padding: 14,
            marginBottom: 20,
          }}
        >
          {/* TIPO */}
          <div
            style={{
              fontSize: 12,
              color: "#666",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Tipo
          </div>

          <select
            value={newTask.task_type}
            onChange={(e) =>
              setNewTask((t) => ({
                ...t,
                task_type: e.target.value,
              }))
            }
            style={{
              ...inp,
              marginBottom: 12,
            }}
          >
            {Object.entries(TASK_TYPES).map(
              ([key, value]) => (
                <option key={key} value={key}>
                  {value.icon} {value.label}
                </option>
              )
            )}
          </select>

          {/* TÍTULO */}
          <div
            style={{
              fontSize: 12,
              color: "#666",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Título
          </div>

          <input
            style={inp}
            placeholder={
              newTask.task_type === "medication"
                ? "Ej: Tomar Losartán 50 mg"
                : newTask.task_type === "measurement"
                ? "Ej: Medir presión arterial"
                : newTask.task_type === "exercise"
                ? "Ej: Caminar 30 minutos"
                : "Ej: Realizar tarea indicada"
            }
            value={newTask.title}
            onChange={(e) =>
              setNewTask((t) => ({
                ...t,
                title: e.target.value,
              }))
            }
          />

          {/* FRECUENCIA */}
          <div
            style={{
              fontSize: 12,
              color: "#666",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Frecuencia
          </div>

          <select
            value={newTask.frequency}
            onChange={(e) =>
              setNewTask((t) => ({
                ...t,
                frequency: e.target.value,
                days_of_week:
                  e.target.value === "weekly"
                    ? t.days_of_week
                    : [],
              }))
            }
            style={inp}
          >
            {Object.entries(FREQUENCIES).map(
              ([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              )
            )}
          </select>

          {/* DÍAS ESPECÍFICOS */}
          {newTask.frequency === "weekly" && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                Días
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                }}
              >
                {WEEK_DAYS.map((day) => {
                  const active =
                    newTask.days_of_week.includes(
                      day.value
                    );

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        toggleWeekDay(day.value)
                      }
                      style={{
                        flex: 1,
                        height: 36,
                        borderRadius: 9,
                        border: active
                          ? "2px solid #1D9E75"
                          : "1px solid #ddd",
                        background: active
                          ? "#E1F5EE"
                          : "#fff",
                        color: active
                          ? "#085041"
                          : "#777",
                        fontWeight: active
                          ? 700
                          : 500,
                        cursor: "pointer",
                      }}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* HORA */}
          <div
            style={{
              fontSize: 12,
              color: "#666",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Hora
          </div>

          <input
            type="time"
            style={inp}
            value={newTask.task_time}
            onChange={(e) =>
              setNewTask((t) => ({
                ...t,
                task_time: e.target.value,
              }))
            }
          />

          {/* FECHAS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 6,
                  fontWeight: 500,
                }}
              >
                Inicio
              </div>

              <input
                type="date"
                style={inp}
                value={newTask.start_date}
                onChange={(e) =>
                  setNewTask((t) => ({
                    ...t,
                    start_date: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 6,
                  fontWeight: 500,
                }}
              >
                Término
              </div>

              <input
                type="date"
                style={inp}
                value={newTask.end_date}
                onChange={(e) =>
                  setNewTask((t) => ({
                    ...t,
                    end_date: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          {/* INSTRUCCIONES */}
          <div
            style={{
              fontSize: 12,
              color: "#666",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Instrucciones
          </div>

          <textarea
            placeholder="Ej: Tomar después del desayuno"
            value={newTask.instructions}
            onChange={(e) =>
              setNewTask((t) => ({
                ...t,
                instructions: e.target.value,
              }))
            }
            style={{
              width: "100%",
              minHeight: 70,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontSize: 14,
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
              marginBottom: 12,
              outline: "none",
            }}
          />

          {/* ERROR */}
          {taskError && (
            <div
              style={{
                background: "#FAECE7",
                color: "#4A1B0C",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                marginBottom: 10,
              }}
            >
              ⚠️ {taskError}
            </div>
          )}

          {/* CREAR */}
          <button
            onClick={addTask}
            disabled={
              addingTask || !newTask.title.trim()
            }
            style={{
              width: "100%",
              padding: "12px 0",
              background:
                addingTask ||
                !newTask.title.trim()
                  ? "#ccc"
                  : "#1D9E75",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor:
                addingTask ||
                !newTask.title.trim()
                  ? "default"
                  : "pointer",
            }}
          >
            {addingTask
              ? "Guardando..."
              : "+ Agregar tarea"}
          </button>
        </div>

        {/* ───────────────────────────────────────────── */}
        {/* TAREAS ACTIVAS */}
        {/* ───────────────────────────────────────────── */}

        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Tareas activas ({activeTasks.length})
        </p>

        {activeTasks.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 24,
              color: "#888",
              fontSize: 13,
              background: "#f7f7f7",
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            Este paciente aún no tiene tareas.
          </div>
        ) : (
          activeTasks.map((task) => {
            const type =
              TASK_TYPES[task.task_type] ||
              TASK_TYPES.general;

            return (
              <div
                key={task.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px",
                  background: "#fff",
                  borderRadius: 12,
                  marginBottom: 8,
                  border: "1px solid #e5e5e5",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "#E1F5EE",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {type.icon}
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {task.title}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#777",
                      marginTop: 4,
                    }}
                  >
                    {getFrequencyText(task)}

                    {task.task_time
                      ? ` · ${task.task_time.slice(
                          0,
                          5
                        )}`
                      : ""}
                  </div>

                  {task.instructions && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#555",
                        marginTop: 6,
                      }}
                    >
                      {task.instructions}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    <button
                      onClick={() =>
                        toggleTaskActive(task)
                      }
                      style={{
                        border: "none",
                        background: "#f0f0f0",
                        borderRadius: 8,
                        padding: "5px 9px",
                        fontSize: 11,
                        cursor: "pointer",
                        color: "#666",
                      }}
                    >
                      Pausar
                    </button>

                    <button
                      onClick={() =>
                        deleteTask(task.id)
                      }
                      style={{
                        border: "none",
                        background: "#FAECE7",
                        borderRadius: 8,
                        padding: "5px 9px",
                        fontSize: 11,
                        cursor: "pointer",
                        color: "#A33A1B",
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* TAREAS PAUSADAS */}
        {inactiveTasks.length > 0 && (
          <>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#888",
                marginTop: 20,
                marginBottom: 10,
              }}
            >
              Tareas pausadas ({inactiveTasks.length})
            </p>

            {inactiveTasks.map((task) => {
              const type =
                TASK_TYPES[task.task_type] ||
                TASK_TYPES.general;

              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 12px",
                    background: "#f7f7f7",
                    borderRadius: 10,
                    marginBottom: 7,
                    opacity: 0.7,
                  }}
                >
                  <span>{type.icon}</span>

                  <div
                    style={{
                      flex: 1,
                      fontSize: 12,
                    }}
                  >
                    {task.title}
                  </div>

                  <button
                    onClick={() =>
                      toggleTaskActive(task)
                    }
                    style={{
                      border: "none",
                      background: "#E1F5EE",
                      color: "#085041",
                      borderRadius: 8,
                      padding: "5px 9px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Reactivar
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  // ── LISTA PACIENTES ─────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        Pacientes registrados
      </p>

      {patients.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "#888",
            fontSize: 13,
          }}
        >
          Aún no hay pacientes.
        </div>
      ) : (
        patients.map((pt) => {
          const ini = (pt.full_name || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={pt.id}
              onClick={() => open(pt)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 14px",
                background: "#f7f7f7",
                borderRadius: 12,
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  background: "#E6F1FB",
                  color: "#0C447C",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {ini}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {pt.full_name}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "#888",
                  }}
                >
                  {pt.age ? `${pt.age}a · ` : ""}
                  {pt.email}
                </div>
              </div>

              <span
                style={{
                  fontSize: 13,
                  color: "#bbb",
                }}
              >
                →
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady]     = useState(false);
  const [pTab, setPTab]       = useState("home");
  const [dTab, setDTab]       = useState("dashboard");

  useEffect(() => {
  let mounted = true;

  const loadUser = async (session) => {
    if (!mounted) return;

    if (session?.user) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      setUser(session.user);
      setProfile(
        data || {
          role: "patient",
          full_name: session.user.email?.split("@")[0] || "Usuario",
          onboarding_done: true,
        }
      );
    } else {
      setUser(null);
      setProfile(null);
    }
  };

  const init = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await loadUser(session);
    } catch (e) {
      console.error("Error session:", e);
      setUser(null);
      setProfile(null);
    }

    // 🔥 CLAVE: SIEMPRE corta loading
    if (mounted) setReady(true);
  };

  init();

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      loadUser(session);
      setReady(true); // 🔥 asegura que nunca quede pegado
    }
  );

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}, []);

  if(!ready) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, background:"#f0f7f4" }}>
      <div style={{ fontSize:36, fontWeight:800, color:"#1D9E75" }}>vita<span style={{color:"#222"}}>lia</span></div>
      <div style={{ width:32,height:32,border:"3px solid #ddd",borderTop:"3px solid #1D9E75",borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />
      <div style={{ fontSize:12, color:"#aaa" }}>Conectando... (máx. 8 segundos)</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(!user)                    return <Login onLogin={(u,p)=>{setUser(u);setProfile(p);}} />;
  if(!profile?.onboarding_done) return <Onboarding user={user} profile={profile} onDone={p=>{setProfile(p);}} />;

  const role      = profile.role||"patient";
  const pTabs     = [{key:"home",icon:"🏠",label:"Inicio"},{key:"pillars",icon:"⬡",label:"Pilares"},{key:"progress",icon:"📈",label:"Progreso"},{key:"profile",icon:"⚙️",label:"Perfil"},{key:"achievements",icon:"🏅",label:"Logros"}];
  const dTabs     = [{key:"dashboard",icon:"📊",label:"Dashboard"},{key:"patients",icon:"👥",label:"Pacientes"}];
  const tabs      = role==="patient"?pTabs:dTabs;
  const activeTab = role==="patient"?pTab:dTab;
  const setTab    = role==="patient"?setPTab:setDTab;

  return (
    <div style={{ maxWidth:480, margin:"0 auto", fontFamily:"system-ui,sans-serif", minHeight:"100vh", background:"#fff" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px",
        borderBottom:"1px solid #eee", position:"sticky", top:0, background:"#fff", zIndex:100 }}>
        <span style={{ fontSize:22, fontWeight:800, color:"#1D9E75" }}>vita<span style={{color:"#222"}}>lia</span></span>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"#888" }}>{profile.full_name?.split(" ")[0]||""}</span>
          <button onClick={()=>supabase.auth.signOut()}
            style={{ fontSize:12, padding:"5px 12px", border:"1px solid #eee", borderRadius:8, background:"transparent", color:"#888", cursor:"pointer" }}>
            Salir
          </button>
        </div>
      </div>
      <div style={{ display:"flex", padding:"8px 10px", background:"#f7f7f7", borderBottom:"1px solid #eee", gap:4 }}>
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ flex:1, padding:"8px 4px", fontSize:11, textAlign:"center", cursor:"pointer", borderRadius:8,
              border:activeTab===t.key?"1px solid #ddd":"1px solid transparent",
              background:activeTab===t.key?"#fff":"transparent",
              color:activeTab===t.key?"#222":"#999", fontWeight:activeTab===t.key?700:400 }}>
            <span style={{ display:"block", fontSize:20, marginBottom:2 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {role==="patient" && <>
        {pTab==="home"     && <Home     user={user} profile={profile} />}
        {pTab==="pillars"  && <Pillars  user={user} />}
        {pTab==="progress" && <Progress user={user} profile={profile} />}
        {pTab==="profile" && (
  <Profile
    user={user}
    profile={profile}
    onUpdate={(p)=>setProfile(p)}
  />
)}
        {pTab==="achievements" && <Achievements user={user} />}
      </>}
      {role==="doctor" && <>
        {dTab==="dashboard" && <DocDashboard doctorId={user.id} />}
        {dTab==="patients"  && <DocPatients  doctorId={user.id} />}
      </>}
    </div>
  );
}