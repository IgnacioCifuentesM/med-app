import { useEffect, useId, useRef } from 'react';

const paths = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  leaf: 'M20 4C6 2 2 9 6 16s16 0 14-12ZM4 21 16 9',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  shield: 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7ZM8 12l3 3 5-6',
  check: 'M5 12l4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  back: 'M20 12H4m6-6-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 2v6m10-6v6M3 11h18',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  users:
    'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 21v-2a8 8 0 0 1 16 0v2M18 4a4 4 0 0 1 0 8m2 3a6 6 0 0 1 2 5',
  chart: 'M4 3v17h17M8 14l4-5 4 2 5-7',
  award: 'M17 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM8 12l-2 9 6-3 6 3-2-9',
  logout: 'M9 4H3v16h6m5-13 5 5-5 5M8 12h11',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
  pill: 'm8 16 8-8M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0Z',
  pulse: 'M3 12h4l3-6 4 12 3-6h4',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6m0-10v.1',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  lock: 'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4',
  pause: 'M8 5v14M16 5v14',
  play: 'm7 4 14 8-14 8Z',
  archive: 'M3 3h18v5H3Zm2 5v13h14V8M9 12h6',
};
export function Icon({ name = 'heart', size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.heart} />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <Icon name="activity" size={23} />
      </span>
      vitalia<span className="logo-dot">.</span>
    </span>
  );
}
export function Button({ children, icon, variant = 'primary', className = '', ...props }) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}
export function Avatar({ name, large = false }) {
  return (
    <span className={`avatar ${large ? 'avatar-lg' : ''}`} aria-hidden="true">
      {name
        ?.split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('') || '?'}
    </span>
  );
}
export function Badge({ children, tone = 'green' }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
export function Field({ label, hint, children, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? children(id) : <input id={id} {...props} />}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function ErrorNotice({ message, retry }) {
  if (!message) return null;
  return (
    <div className="notice notice-error" role="alert">
      <Icon name="info" />
      <div>
        {message}
        {retry && (
          <button className="text-link" onClick={retry}>
            Volver a intentar
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({ title, children, icon = 'leaf', action }) {
  return (
    <div className="empty">
      <span className="icon-tile tone-green">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading({ label = 'Cargando tu espacio…' }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}
export function PageHeading({ eyebrow, title, children, action }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <p className="subtitle">{children}</p>}
      </div>
      {action}
    </header>
  );
}
export function Stat({ label, value, caption, icon, tone = 'green' }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`icon-tile tone-${tone}`}>
          <Icon name={icon} />
        </span>
      </div>
      <strong>{value ?? '—'}</strong>
      <small>{caption}</small>
    </div>
  );
}
export function Meter({ value, color = 'green', label }) {
  return (
    <div
      className={`meter meter-${color}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? 0}
      aria-valuetext={value == null ? 'Sin registros' : `${value} de 100`}
    >
      <span style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}
export function Modal({ title, children, onClose, busy = false, wide = false }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Cerrar" disabled={busy} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function SectionHeading({ title, children, action }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
