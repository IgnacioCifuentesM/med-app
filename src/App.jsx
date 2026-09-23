import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { createApi, friendlyError } from './lib/api';
import { useToday } from './hooks/useToday';
import { Button, ErrorNotice, Loading, Logo } from './components/ui';
import Shell from './components/Shell';
import Auth from './pages/Auth';

const Patient = lazy(() => import('./pages/Patient'));
const Doctor = lazy(() => import('./pages/Doctor'));
const Profile = lazy(() => import('./pages/Profile'));
const getPath = () => window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '';
const demoRole = () => { try { return sessionStorage.getItem('vitalia-demo-role'); } catch { return null; } };

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="startup"><Logo /><h1>No pudimos mostrar esta pantalla.</h1><p>Recarga para volver a intentarlo.</p><Button onClick={() => window.location.reload()}>Recargar</Button></div>;
    return this.props.children;
  }
}
export default function App() { return <ErrorBoundary><Vitalia /></ErrorBoundary>; }
function Vitalia() {
  const [demo, setDemo] = useState(demoRole);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [path, setPath] = useState(getPath);
  const [recovery, setRecovery] = useState(() => new URLSearchParams(window.location.search).get('resetPassword') === 'true');
  const [toast, setToast] = useState('');
  const epoch = useRef(0);
  const api = useMemo(() => createApi(Boolean(demo)), [demo]);
  const today = useToday(profile?.timezone || 'America/Santiago');
  const navigate = useCallback(next => { window.location.hash = `/${next}`; }, []);
  const notify = useCallback(message => setToast(message), []);
  useEffect(() => { const update = () => { setPath(getPath()); window.scrollTo({ top: 0 }); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    let mounted = true;
    const counter = epoch;
    let loadTimer;
    const load = async session => {
      const ticket = ++epoch.current;
      setReady(false); setError(''); setProfile(null);
      let deadline;
      try {
        const work = async () => {
          if (demo) return api.profile(demo === 'doctor' ? 'demo-doctor' : 'demo-patient');
          if (!session?.user) return null;
          await api.ready();
          return api.profile(session.user.id);
        };
        const result = await Promise.race([work(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('timeout')), 12000); })]);
        if (mounted && ticket === epoch.current) setProfile(result);
      } catch (err) { if (mounted && ticket === epoch.current) setError(friendlyError(err)); }
      finally { clearTimeout(deadline); if (mounted && ticket === epoch.current) setReady(true); }
    };
    const schedule = session => { clearTimeout(loadTimer); ++epoch.current; loadTimer = setTimeout(() => { if (mounted) void load(session); }, 0); };
    const init = async () => {
      if (demo || !supabase) { schedule(null); return; }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionError) { setError(friendlyError(sessionError)); setReady(true); } else schedule(data.session);
    };
    const timer = setTimeout(() => { void init(); }, 0);
    const subscription = !demo && supabase ? supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Supabase callbacks stay synchronous. Database requests are deferred.
      if (event !== 'TOKEN_REFRESHED') schedule(session);
    }).data.subscription : null;
    return () => { mounted = false; ++counter.current; clearTimeout(timer); clearTimeout(loadTimer); subscription?.unsubscribe(); };
  }, [api, demo, retry]);
  function enterDemo(role) { sessionStorage.setItem('vitalia-demo-role', role); setProfile(null); setReady(false); setDemo(role); setRecovery(false); navigate(role === 'doctor' ? 'overview' : 'home'); }
  async function logout() {
    if (demo) { sessionStorage.removeItem('vitalia-demo-role'); setProfile(null); setDemo(null); setReady(false); navigate(''); return; }
    try { const { error } = await supabase.auth.signOut(); if (error) throw error; setProfile(null); navigate(''); } catch (err) { notify(friendlyError(err)); }
  }
  function recovered() { setRecovery(false); window.history.replaceState({}, '', window.location.pathname); navigate('home'); notify('Tu contraseña quedó actualizada.'); }
  if (!ready) return <div className="startup"><Logo /><Loading label="Preparando tu espacio…" /></div>;
  if (recovery) return <Auth key="recovery" enterDemo={enterDemo} recovery onRecovered={recovered} />;
  if (error) return <div className="startup"><Logo /><h1>Necesitamos reconectar tu espacio.</h1><ErrorNotice message={error} retry={() => setRetry(n => n + 1)} /><div className="demo-buttons"><Button variant="secondary" onClick={logout}>Volver al acceso</Button><Button onClick={() => enterDemo('patient')}>Explorar demostración</Button></div><p className="microcopy">Si la base necesita actualización, aplica la migración indicada en el README del proyecto.</p></div>;
  if (!profile) return <Auth enterDemo={enterDemo} />;
  const isDoctor = profile.role === 'doctor';
  const effectivePath = path || (isDoctor ? 'overview' : 'home');
  const allowed = isDoctor ? ['overview', 'patients', 'profile'] : ['home', 'pillars', 'progress', 'achievements', 'profile'];
  const page = allowed.includes(effectivePath.split('/')[0]) ? effectivePath : (isDoctor ? 'overview' : 'home');
  const onUpdated = updated => { setProfile(updated); if (!profile.onboarding_done) navigate(isDoctor ? 'overview' : 'home'); };
  return <Shell {...{ profile, demo, today, navigate, logout }} path={page} switchDemo={() => enterDemo(isDoctor ? 'patient' : 'doctor')}>
    <Suspense fallback={<Loading />}>{!profile.onboarding_done || page === 'profile' ? <Profile key={`${profile.id}-${profile.onboarding_done}`} {...{ api, profile, onUpdated, notify }} onboarding={!profile.onboarding_done} /> : isDoctor ? <Doctor {...{ api, profile, today, page, navigate, notify }} /> : <Patient key={page} {...{ api, profile, today, page, navigate, notify }} />}</Suspense>
    {toast && <div className="toast" role="status">{toast}<button aria-label="Cerrar mensaje" onClick={() => setToast('')}>×</button></div>}
  </Shell>;
}
