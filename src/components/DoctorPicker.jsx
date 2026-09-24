import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { Button, ErrorNotice, Icon, Loading } from './ui';

export default function DoctorPicker({ api, doctors, selected, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState(doctors);
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  const labelId = useId();
  const names = new Map([...known, ...doctors].map((doctor) => [doctor.id, doctor.full_name]));
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);
  function toggle(doctor) {
    setKnown((previous) => [...previous.filter((entry) => entry.id !== doctor.id), doctor]);
    onChange(
      selected.includes(doctor.id)
        ? selected.filter((id) => id !== doctor.id)
        : [...selected, doctor.id],
    );
  }
  return (
    <div
      className="doctor-picker"
      ref={root}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
    >
      <span className="doctor-picker-label" id={labelId}>
        Profesionales con acceso a tus datos
      </span>
      <div className="doctor-picker-anchor">
        <button
          ref={trigger}
          type="button"
          className="doctor-picker-trigger"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="search" />
          <span>
            {selected.length
              ? `${selected.length} profesional${selected.length === 1 ? '' : 'es'} seleccionado${selected.length === 1 ? '' : 's'}`
              : 'Seleccionar profesionales'}
          </span>
          <Icon name="chevron" />
        </button>
        {open && !disabled && (
          <div className="doctor-picker-panel" id={panelId} role="dialog" aria-labelledby={labelId}>
            <DoctorSearch {...{ api, selected, toggle, close }} />
          </div>
        )}
      </div>
      {!!selected.length && (
        <ul className="doctor-chips" aria-label="Profesionales seleccionados">
          {selected.map((id) => (
            <li key={id}>
              <span>{names.get(id) || 'Profesional vinculado'}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Quitar a ${names.get(id) || 'profesional vinculado'}`}
                onClick={() => onChange(selected.filter((value) => value !== id))}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="microcopy">Los cambios de tu equipo se aplican al guardar el perfil.</p>
    </div>
  );
}

function DoctorSearch({ api, selected, toggle, close }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState({ search: '', offset: 0 });
  const search = useRef(null);
  const inputId = useId();
  useEffect(() => {
    search.current?.focus();
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((previous) =>
          previous.search === input ? previous : { search: input, offset: 0 },
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [input]);
  const loader = useCallback(() => api.searchDoctors(query.search, query.offset), [api, query]);
  const resource = useResource(loader);
  const waiting = resource.loading || input !== query.search;
  return (
    <>
      <div className="doctor-picker-search">
        <label htmlFor={inputId}>Buscar profesional por nombre</label>
        <input
          id={inputId}
          ref={search}
          type="search"
          autoComplete="off"
          maxLength={120}
          placeholder="Escribe un nombre…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              event.currentTarget
                .closest('[role="dialog"]')
                ?.querySelector('input[type="checkbox"]:not(:disabled)')
                ?.focus();
            }
          }}
        />
      </div>
      <ErrorNotice message={resource.error} retry={resource.reload} />
      <div className="doctor-picker-results" aria-busy={waiting}>
        {waiting ? (
          <Loading label="Buscando profesionales…" />
        ) : !resource.error && !resource.data?.items.length ? (
          <p className="muted">
            {query.search
              ? 'No encontramos profesionales con ese nombre.'
              : 'Todavía no hay profesionales disponibles.'}
          </p>
        ) : (
          !resource.error && (
            <div role="group" aria-label="Resultados de profesionales">
              {resource.data?.items.map((doctor) => (
                <label className="doctor-picker-option" key={doctor.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(doctor.id)}
                    disabled={!selected.includes(doctor.id) && selected.length >= 50}
                    onChange={() => toggle(doctor)}
                  />
                  <span>{doctor.full_name}</span>
                </label>
              ))}
            </div>
          )
        )}
      </div>
      {selected.length >= 50 && (
        <p className="microcopy">Puedes seleccionar hasta 50 profesionales.</p>
      )}
      <div className="doctor-picker-pagination">
        <Button
          variant="ghost"
          disabled={waiting || query.offset === 0}
          onClick={() =>
            setQuery((value) => ({ ...value, offset: Math.max(0, value.offset - 30) }))
          }
        >
          Anterior
        </Button>
        <span className="microcopy">Página {Math.floor(query.offset / 30) + 1}</span>
        <Button
          variant="ghost"
          disabled={waiting || !!resource.error || !resource.data?.hasMore}
          onClick={() => setQuery((value) => ({ ...value, offset: value.offset + 30 }))}
        >
          Siguiente
        </Button>
      </div>
      <Button variant="secondary" className="full-width" onClick={close}>
        Listo
      </Button>
    </>
  );
}
