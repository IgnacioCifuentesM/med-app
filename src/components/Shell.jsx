import { Avatar, Icon, Logo } from './ui';
import { formatDay } from '../lib/domain';

export default function Shell({
  profile,
  path,
  demo,
  navigate,
  logout,
  switchDemo,
  today,
  children,
}) {
  const doctor = profile.role === 'doctor';
  const items = doctor
    ? [
        ['overview', 'Vista general', 'grid'],
        ['patients', 'Mis pacientes', 'users'],
        ['profile', 'Mi perfil', 'user'],
      ]
    : [
        ['home', 'Mi día', 'home'],
        ['pillars', 'Mis pilares', 'leaf'],
        ['progress', 'Mi progreso', 'chart'],
        ['achievements', 'Mis logros', 'award'],
        ['profile', 'Mi perfil', 'user'],
      ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <a
          href={doctor ? '#/overview' : '#/home'}
          className="brand-link"
          aria-label="Vitalia, inicio"
        >
          <Logo />
        </a>
        <div className="workspace-label">
          {doctor ? 'ESPACIO PROFESIONAL' : 'TU ESPACIO DE BIENESTAR'}
        </div>
        <nav aria-label="Navegación principal">
          {items.map(([key, name, icon]) => (
            <a
              key={key}
              href={`#/${key}`}
              aria-current={path === key || path.startsWith(`${key}/`) ? 'page' : undefined}
              className={
                path === key || path.startsWith(`${key}/`) ? 'nav-item active' : 'nav-item'
              }
            >
              <Icon name={icon} />
              {name}
              {(path === key || path.startsWith(`${key}/`)) && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-orbit">
            <Icon name={doctor ? 'heart' : 'leaf'} size={28} />
          </span>
          <strong>{doctor ? 'Acompañar hace la diferencia.' : 'Un paso a la vez.'}</strong>
          <p>
            {doctor
              ? 'Una mirada cercana a cada proceso.'
              : 'Los pequeños hábitos también son grandes avances.'}
          </p>
        </div>
        <div className="sidebar-bottom">
          <div className="identity">
            <Avatar name={profile.full_name} />
            <div>
              <strong>{profile.full_name}</strong>
              <small>{doctor ? 'Profesional de salud' : 'Mi cuenta personal'}</small>
            </div>
          </div>
          <button className="nav-item logout" onClick={logout}>
            <Icon name="logout" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="mobile-brand">
            <Logo />
          </div>
          <div className="breadcrumb">
            Mi espacio <span>/</span>{' '}
            <strong>{items.find((i) => path.startsWith(i[0]))?.[1] || 'Paciente'}</strong>
          </div>
          <div className="topbar-right">
            <span className="date-chip">
              <Icon name="calendar" size={16} />
              {formatDay(today, { weekday: 'short', day: 'numeric', month: 'long' })}
            </span>
            <button
              className="avatar-button"
              aria-label="Abrir mi perfil"
              onClick={() => navigate('profile')}
            >
              <Avatar name={profile.full_name} />
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="status-dot" />
              Modo demostración · datos ficticios guardados en este navegador
            </span>
            <button onClick={switchDemo}>
              Ver como {doctor ? 'paciente' : 'profesional'} <Icon name="arrow" size={15} />
            </button>
          </div>
        )}
        <main id="main-content" tabIndex={-1} key={profile.id}>
          {children}
        </main>
        <footer className="app-footer">
          <span>Vitalia · Tu salud, acompañada</span>
          <span>Hecho para avanzar a tu ritmo</span>
        </footer>
      </div>
    </div>
  );
}
