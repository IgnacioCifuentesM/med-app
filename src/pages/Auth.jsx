import { useState } from 'react';
import { supabase } from '../supabase';
import { friendlyError } from '../lib/api';
import { Button, ErrorNotice, Field, Icon, Logo } from '../components/ui';

export default function Auth({ enterDemo, recovery = false, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'reset' : 'login');
  const [form, setForm] = useState({ email: '', password: '', confirm: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  function changeMode(next) { setMode(next); setError(''); setMessage(''); }
  async function submit(event) {
    event.preventDefault(); if (busy) return; setError(''); setMessage('');
    if (!supabase) { setError('Configura Supabase para usar una cuenta. Puedes explorar la demostración.'); return; }
    if (['register', 'reset'].includes(mode) && form.password.length < 10) { setError('Usa una contraseña de al menos 10 caracteres.'); return; }
    if (mode === 'reset' && form.password !== form.confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/?resetPassword=true`;
      let result;
      if (mode === 'login') result = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (mode === 'register') result = await supabase.auth.signUp({ email: form.email.trim(), password: form.password, options: { data: { full_name: form.name.trim() }, emailRedirectTo: window.location.origin } });
      if (mode === 'forgot') result = await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo });
      if (mode === 'reset') result = await supabase.auth.updateUser({ password: form.password });
      if (result.error) throw result.error;
      if (mode === 'register' && !result.data.session) { setMessage('Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.'); setMode('login'); setForm(f => ({ ...f, password: '' })); }
      if (mode === 'forgot') setMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisa también spam.');
      if (mode === 'reset') { setMessage('Contraseña actualizada.'); onRecovered(); }
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function resend() {
    if (!form.email.trim() || !supabase || busy) return; setBusy(true); setError('');
    try { const { error } = await supabase.auth.resend({ type: 'signup', email: form.email.trim(), options: { emailRedirectTo: window.location.origin } }); if (error) throw error; setMessage('Revisa tu correo para confirmar la cuenta.'); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  const titles = { login: 'Qué bueno verte.', register: 'Tu bienestar empieza aquí.', forgot: 'Recupera tu acceso.', reset: 'Una nueva contraseña.' };
  return <div className="auth-layout"><section className="auth-story"><Logo /><div className="auth-copy"><span className="eyebrow">TU SALUD, ACOMPAÑADA</span><h1>Pequeños hábitos.<br /><em>Una vida más tuya.</em></h1><p>Un espacio para conocerte, cuidar de ti y avanzar junto a tu equipo de salud.</p><div className="auth-illustration" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="floating-icon f-one"><Icon name="leaf" size={32} /></span><span className="floating-icon f-two"><Icon name="moon" size={26} /></span><span className="floating-icon f-three"><Icon name="heart" size={28} /></span><div className="auth-mini-card"><span className="mini-check"><Icon name="check" /></span><div><strong>Cada paso cuenta</strong><small>El progreso se construye día a día.</small></div></div></div></div><p className="auth-story-footer"><Icon name="heart" size={17} /> Bienestar con una mirada humana.</p></section>
    <section className="auth-panel"><div className="auth-form"><span className="eyebrow">BIENVENIDO A VITALIA</span><h2>{titles[mode]}</h2><p className="subtitle">{mode === 'login' ? 'Entra a tu espacio y continúa donde lo dejaste.' : mode === 'register' ? 'Crea tu cuenta personal. Los profesionales acceden por invitación.' : 'Te ayudamos a volver a tu espacio.'}</p>
      <ErrorNotice message={error} />{message && <div role="status" className="notice notice-success">{message}</div>}
      <form onSubmit={submit}><fieldset disabled={busy}>
        {mode === 'register' && <Field label="Nombre completo" value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" maxLength={120} required />}
        {mode !== 'reset' && <Field label="Correo electrónico" type="email" placeholder="tu@correo.cl" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />}
        {mode !== 'forgot' && <Field label={mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'} type="password" value={form.password} onChange={e => set('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 10} required hint={mode !== 'login' ? 'Al menos 10 caracteres.' : undefined} />}
        {mode === 'reset' && <Field label="Repite la contraseña" type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)} autoComplete="new-password" required />}
        {mode === 'login' && <button type="button" className="text-link forgot-link" onClick={() => changeMode('forgot')}>¿Olvidaste tu contraseña?</button>}
        <Button type="submit" className="full-width" icon="arrow" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Entrar a mi espacio' : mode === 'register' ? 'Crear mi cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Guardar contraseña'}</Button>
      </fieldset></form>
      {!recovery && <><p className="auth-switch">{mode === 'login' ? '¿Primera vez aquí?' : '¿Ya tienes cuenta?'} <button className="text-link" disabled={busy} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Crea tu cuenta' : 'Inicia sesión'}</button></p>{mode === 'login' && form.email && <button className="text-link resend" disabled={busy} onClick={resend}>Reenviar confirmación de correo</button>}<div className="divider"><span>¿Quieres conocer Vitalia?</span></div><div className="demo-buttons"><Button variant="secondary" onClick={() => enterDemo('patient')} icon="user">Demo paciente</Button><Button variant="secondary" onClick={() => enterDemo('doctor')} icon="users">Demo profesional</Button></div><p className="microcopy">Explora con datos ficticios. No necesitas una cuenta.</p></>}
    </div><p className="auth-bottom">Tu ritmo. Tus hábitos. Tu bienestar.</p></section></div>;
}
