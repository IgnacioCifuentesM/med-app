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
  const [mode, setMode]         = useState("login");
  const [role, setRole]         = useState("patient");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const doLogin = async () => {
    if(!email||!password){ setError("Completa email y contraseña"); return; }
    setLoading(true); setError("");
    const { data, error:err } = await supabase.auth.signInWithPassword({ email, password });
    if(err){ setError(err.message); setLoading(false); return; }
    const { data:prof } = await supabase.from("profiles").select("*").eq("id",data.user.id).maybeSingle();
    onLogin(data.user, prof || { role:"patient", full_name:email.split("@")[0], onboarding_done:false });
    setLoading(false);
  };

  const doRegister = async () => {
    if(!email||!password||!name){ setError("Completa todos los campos"); return; }
    if(password.length < 6){ setError("La contraseña debe tener al menos 6 caracteres"); return; }
    setLoading(true); setError("");
    const { data, error:err } = await supabase.auth.signUp({ email, password });
    if(err){ setError(err.message); setLoading(false); return; }
    if(data.user){
      await supabase.from("profiles").upsert({ id:data.user.id, role, full_name:name, email, onboarding_done:false });
    }
    setSuccess("¡Cuenta creada! Ahora inicia sesión.");
    setMode("login"); setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f7f4", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:"36px 28px", width:"100%", maxWidth:380, boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:36, fontWeight:800, color:"#1D9E75" }}>vita<span style={{color:"#222"}}>lia</span></div>
          <div style={{ fontSize:13, color:"#888", marginTop:6 }}>Medicina de estilo de vida</div>
        </div>
        <div style={{ display:"flex", border:"1px solid #eee", borderRadius:10, overflow:"hidden", marginBottom:24 }}>
          {["login","register"].map(m=>(
            <button key={m} onClick={()=>{ setMode(m); setError(""); setSuccess(""); }}
              style={{ flex:1, padding:"11px 0", fontSize:14, border:"none", cursor:"pointer",
                background:mode===m?"#1D9E75":"transparent", color:mode===m?"#fff":"#888", fontWeight:mode===m?700:400 }}>
              {m==="login"?"Iniciar sesión":"Registrarse"}
            </button>
          ))}
        </div>
        {error   && <div style={{ background:"#FAECE7", color:"#4A1B0C", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:12 }}>⚠️ {error}</div>}
        {success && <div style={{ background:"#E1F5EE", color:"#085041", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:12 }}>✓ {success}</div>}
        {mode==="register" && <>
          <div style={{ fontSize:12, color:"#666", marginBottom:6, fontWeight:500 }}>Nombre completo</div>
          <input style={inp} placeholder="Tu nombre completo" value={name} onChange={e=>setName(e.target.value)} />
          <div style={{ fontSize:12, color:"#666", marginBottom:8, fontWeight:500 }}>Soy...</div>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {["patient","doctor"].map(r=>(
              <button key={r} onClick={()=>setRole(r)}
                style={{ flex:1, padding:"11px 0", fontSize:13, cursor:"pointer", borderRadius:10,
                  border:`2px solid ${role===r?"#1D9E75":"#eee"}`,
                  background:role===r?"#E1F5EE":"transparent",
                  color:role===r?"#085041":"#888", fontWeight:role===r?700:400 }}>
                {r==="patient"?"🧑 Paciente":"👨‍⚕️ Doctor"}
              </button>
            ))}
          </div>
        </>}
        <div style={{ fontSize:12, color:"#666", marginBottom:6, fontWeight:500 }}>Email</div>
        <input style={inp} type="email" placeholder="tu@email.com" value={email} onChange={e=>setEmail(e.target.value)} />
        <div style={{ fontSize:12, color:"#666", marginBottom:6, fontWeight:500 }}>Contraseña</div>
        <input style={inp} type="password" placeholder="Mínimo 6 caracteres" value={password}
          onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(mode==="login"?doLogin():doRegister())} />
        <button onClick={mode==="login"?doLogin:doRegister} disabled={loading} style={btnStyle(loading?"#aaa":"#1D9E75")}>
          {loading?"Cargando...":(mode==="login"?"Entrar →":"Crear cuenta")}
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
  const [metas, setMetas] = useState([]);

  const PILLAR_ICONS = {
    nutricion: "🥗",
    actividad: "🏃",
    sueno: "🌙",
    sustancias: "🚭",
    estres: "🧘",
    conexion: "❤️",
  };

  const mapPillarToColor = (pillar) => {
    return COLORS[pillar] || COLORS.actividad;
  };

  const getStreak = (records) => {
    const dates = [...new Set(records.map(r => r.date))].sort().reverse();
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

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split("T")[0];

      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const startStr = startOfWeek.toISOString().split("T")[0];

      // metas
      const { data: goals } = await supabase
        .from("goals")
        .select("*")
        .eq("patient_id", user.id)
        .gte("week_start", startStr);

      let metasBase = (goals || []).map(g => ({
        id: g.id,
        key: g.id,
        text: g.description,
        pillar: g.pillar,
        done: false,
      }));

      const { data: todayData } = await supabase
        .from("pillar_records")
        .select("data")
        .eq("user_id", user.id)
        .eq("date", today)
        .eq("pillar", "metas")
        .maybeSingle();

      if (todayData?.data) {
        metasBase = metasBase.map(m => ({
          ...m,
          done: todayData.data[m.key] || false
        }));
      }

      setMetas(metasBase);

      // pilares
      const { data: rec } = await supabase
        .from("pillar_records")
        .select("score,pillar,date")
        .eq("user_id", user.id)
        .gte("date", new Date(Date.now() - 7*86400000).toISOString().split("T")[0])
        .neq("pillar", "metas");

      setRecords(rec || []);
    };

    load();
  }, [user.id]);

  const toggleMeta = async (i) => {
    const n = [...metas];
    n[i] = { ...n[i], done: !n[i].done };
    setMetas(n);

    const today = new Date().toISOString().split("T")[0];

    const metaData = {};
    n.forEach(m => { metaData[m.key] = m.done; });

    const completed = n.filter(m => m.done).length;
    const allDone = completed === n.length;

    await supabase.from("pillar_records").upsert(
      {
        user_id: user.id,
        date: today,
        pillar: "metas",
        data: metaData,
        score: allDone ? 100 : 0
      },
      { onConflict: "user_id,date,pillar" }
    );
  };

  // SCORE
  const pillarScore = records.length
    ? Math.round(records.reduce((a,r)=>a+(r.score||0),0)/records.length)
    : 0;

  const metasCompleted = metas.filter(m => m.done).length;
  const metasRatio = metas.length ? metasCompleted / metas.length : 0;
  const metasBonus = metasRatio === 1 ? 10 : Math.round(metasRatio * 10);

  const finalScore = Math.min(100, Math.round(pillarScore * 0.9) + metasBonus);

  const nombre = profile?.full_name?.split(" ")[0] || "ahí";
  const streak = getStreak(records);

  return (
    <div style={{ padding:16 }}>
      <p style={{ fontSize:22, fontWeight:700 }}>Hola, {nombre} 👋</p>

      {/* SCORE */}
      <div style={{
        background:"#1D9E75",
        borderRadius:20,
        padding:20,
        color:"#fff",
        textAlign:"center",
        marginBottom:20
      }}>
        <div style={{ fontSize:12 }}>Score</div>
        <div style={{ fontSize:60, fontWeight:800 }}>{finalScore || "—"}</div>
      </div>

      {/* STREAK */}
      <div style={{ marginBottom:20 }}>
        🔥 {streak} días seguidos
      </div>

      {/* METAS HEADER */}
      <div style={{ marginBottom:10 }}>
        <p style={{ fontWeight:700 }}>Metas de hoy</p>
        <div style={{
          height:6,
          background:"#eee",
          borderRadius:4,
          overflow:"hidden"
        }}>
          <div style={{
            width:`${metasRatio * 100}%`,
            background:"#1D9E75",
            height:"100%"
          }} />
        </div>
      </div>

      {/* METAS */}
      {metas.map((m,i)=>{
        const color = mapPillarToColor(m.pillar);
        const icon = PILLAR_ICONS[m.pillar] || "🎯";

        return (
          <div
            key={m.id}
            onClick={()=>toggleMeta(i)}
            style={{
              display:"flex",
              alignItems:"center",
              gap:12,
              padding:14,
              borderRadius:14,
              marginBottom:10,
              cursor:"pointer",
              background: m.done ? color.light : "#fff",
              border:`2px solid ${color.main}`
            }}
          >
            {/* ICON */}
            <div style={{
              fontSize:22,
              width:34,
              height:34,
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              borderRadius:10,
              background: color.light
            }}>
              {icon}
            </div>

            {/* TEXT */}
            <div style={{ flex:1 }}>
              <div style={{
                fontSize:14,
                fontWeight:600,
                textDecoration: m.done ? "line-through" : "none",
                color: m.done ? "#999" : "#222"
              }}>
                {m.text}
              </div>
            </div>

            {/* CHECK */}
            <div style={{
              width:22,
              height:22,
              borderRadius:"50%",
              border:`2px solid ${color.main}`,
              background: m.done ? color.main : "transparent",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              color:"#fff",
              fontSize:12
            }}>
              {m.done ? "✓" : ""}
            </div>
          </div>
        );
      })}
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
  const [recs, setRecs]         = useState([]);
  const [goals, setGoals]       = useState([]);
  const [newGoal, setNewGoal]   = useState({ description:"", pillar:"nutricion" });
  const [addingGoal, setAddingGoal] = useState(false);

  useEffect(()=>{
  const loadPatients = async () => {
    // 1. obtener relaciones
    const { data: relations } = await supabase
      .from("doctor_patients")
      .select("patient_id")
      .eq("doctor_id", doctorId);

    const ids = (relations || []).map(r => r.patient_id);

    if (ids.length === 0) {
      setPatients([]);
      return;
    }

    // 2. traer solo esos pacientes
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids);

    setPatients(data || []);
  };

  loadPatients();
}, [doctorId]);

  const open = async (pt) => {
    setSelected(pt);
    const [{data:r},{data:g}] = await Promise.all([
      supabase.from("pillar_records").select("*").eq("user_id",pt.id).order("date",{ascending:false}).limit(60),
      supabase.from("goals").select("*").eq("patient_id",pt.id).order("created_at",{ascending:false}),
    ]);
    setRecs(r||[]); setGoals(g||[]);
  };

  const addGoal = async () => {
    if(!newGoal.description.trim()) return;
    setAddingGoal(true);
    const {data,error} = await supabase.from("goals").insert({
      patient_id: selected.id, doctor_id: doctorId,
      pillar: newGoal.pillar, description: newGoal.description, done:false,
    }).select().single();
    if(!error){ setGoals(g=>[data,...g]); setNewGoal({description:"",pillar:"nutricion"}); }
    setAddingGoal(false);
  };

  const deleteGoal = async (id) => {
    await supabase.from("goals").delete().eq("id",id);
    setGoals(g=>g.filter(x=>x.id!==id));
  };

  if(selected){
    const avg  = recs.length ? Math.round(recs.reduce((a,r)=>a+(r.score||0),0)/recs.length) : 0;
    const avgs = PILLARS.map(p=>{ const pr=recs.filter(r=>r.pillar===p.key); return pr.length?Math.round(pr.reduce((a,r)=>a+(r.score||0),0)/pr.length):0; });
    const ini  = (selected.full_name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    const imc  = selected.weight&&selected.height ? (Number(selected.weight)/Math.pow(Number(selected.height)/100,2)).toFixed(1) : "—";
    return (
      <div style={{ padding:16 }}>
        <button onClick={()=>{setSelected(null);setRecs([]);setGoals([]);}}
          style={{ border:"none",background:"none",color:"#888",fontSize:13,cursor:"pointer",marginBottom:16,padding:0 }}>← Volver</button>

        <div style={{ background:"#f7f7f7", borderRadius:14, padding:16, marginBottom:16, display:"flex", gap:14, alignItems:"center" }}>
          <div style={{ width:52,height:52,borderRadius:"50%",background:"#E6F1FB",color:"#0C447C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,flexShrink:0 }}>{ini}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:17, fontWeight:700 }}>{selected.full_name}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{selected.age?`${selected.age}a · `:""}{selected.sex==="M"?"M":selected.sex==="F"?"F":""}</div>
            <div style={{ display:"flex", gap:16, marginTop:8 }}>
              {[["IMC",imc],["%G",selected.body_fat||"—"],["Kg",selected.weight||"—"],["Score",avg||"—"]].map(([l,v])=>(
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{v}</div>
                  <div style={{ fontSize:10, color:"#888" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selected.objective && (
          <div style={{ background:"#E1F5EE", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#085041" }}>
            🎯 {selected.objective}
          </div>
        )}
        {(selected.risk_hta||selected.risk_dm2||selected.risk_dislipidemia) && (
          <div style={{ background:"#FAECE7", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#4A1B0C" }}>
            ⚠️ {[selected.risk_hta&&"HTA",selected.risk_dm2&&"DM2",selected.risk_dislipidemia&&"Dislipidemia"].filter(Boolean).join(" · ")}
          </div>
        )}

        <p style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Pilares (promedio)</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
          {PILLARS.map((p,i)=>(
            <div key={p.key} style={{ background:"#f7f7f7", borderRadius:12, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:600 }}>{p.icon} {p.name}</span>
                <span style={{ fontSize:20, fontWeight:800, color:COLORS[p.key].main }}>{avgs[i]||"—"}</span>
              </div>
              <ScoreBar score={avgs[i]||0} color={COLORS[p.key].main} />
            </div>
          ))}
        </div>

        <p style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Asignar meta al paciente</p>
        <div style={{ background:"#f7f7f7", borderRadius:14, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:12, color:"#666", marginBottom:6, fontWeight:500 }}>Pilar</div>
          <select value={newGoal.pillar} onChange={e=>setNewGoal(g=>({...g,pillar:e.target.value}))}
            style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1px solid #ddd", fontSize:14, marginBottom:10, background:"#fff" }}>
            {PILLARS.map(p=><option key={p.key} value={p.key}>{p.icon} {p.name}</option>)}
          </select>
          <div style={{ fontSize:12, color:"#666", marginBottom:6, fontWeight:500 }}>Descripción de la meta</div>
          <input style={{...inp, marginBottom:10}} placeholder="Ej: Caminar 30 min diarios esta semana"
            value={newGoal.description} onChange={e=>setNewGoal(g=>({...g,description:e.target.value}))} />
          <button onClick={addGoal} disabled={addingGoal||!newGoal.description.trim()}
            style={{ width:"100%", padding:"10px 0", background:addingGoal||!newGoal.description.trim()?"#ccc":"#1D9E75",
              color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
            {addingGoal?"Guardando...":"+ Agregar meta"}
          </button>
        </div>

        <p style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Metas asignadas ({goals.length})</p>
        {goals.length===0
          ? <div style={{ textAlign:"center", padding:20, color:"#888", fontSize:13 }}>Sin metas asignadas aún.</div>
          : goals.map(g=>{
              const c = COLORS[g.pillar]||COLORS.actividad;
              return (
                <div key={g.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px",
                  background:g.done?c.light:"#f7f7f7", borderRadius:12, marginBottom:8,
                  border:`1.5px solid ${g.done?c.main:"#eee"}` }}>
                  <div style={{ width:20, height:20, borderRadius:"50%", flexShrink:0,
                    background:g.done?c.main:"transparent", border:`2px solid ${g.done?c.main:"#ccc"}`,
                    display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11 }}>
                    {g.done?"✓":""}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, textDecoration:g.done?"line-through":"none", color:g.done?"#aaa":"inherit" }}>{g.description}</div>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:c.light, color:c.dark }}>{g.pillar}</span>
                  </div>
                  <button onClick={()=>deleteGoal(g.id)}
                    style={{ border:"none", background:"none", color:"#ccc", fontSize:18, cursor:"pointer", padding:"0 4px" }}>×</button>
                </div>
              );
            })
        }
      </div>
    );
  }

  return (
    <div style={{ padding:16 }}>
      <p style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Pacientes registrados</p>
      {patients.length===0
        ? <div style={{ textAlign:"center", padding:40, color:"#888", fontSize:13 }}>Aún no hay pacientes.</div>
        : patients.map(pt=>{
            const ini=(pt.full_name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
            return (
              <div key={pt.id} onClick={()=>open(pt)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 14px", background:"#f7f7f7", borderRadius:12, marginBottom:8, cursor:"pointer" }}>
                <div style={{ width:42,height:42,borderRadius:"50%",background:"#E6F1FB",color:"#0C447C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0 }}>{ini}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{pt.full_name}</div>
                  <div style={{ fontSize:12, color:"#888" }}>{pt.age?`${pt.age}a · `:""}{pt.email}</div>
                </div>
                <span style={{ fontSize:13, color:"#bbb" }}>→</span>
              </div>
            );
          })
      }
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