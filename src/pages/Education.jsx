import { useCallback, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { addDays, formatDay, PILLARS } from '../lib/domain';
import { weekStart } from '../lib/wellbeing';
import { friendlyError } from '../lib/api';
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Icon,
  Loading,
  PageHeading,
} from '../components/ui';

export default function Education({ api, profile, today, notify }) {
  const [week, setWeek] = useState(weekStart(today));
  const [pillar, setPillar] = useState(PILLARS[0].key);
  const [busy, setBusy] = useState(false);
  const tabs = useRef([]);
  const doctor = profile.role === 'doctor';
  const loader = useCallback(() => api.education(profile, week), [api, profile, week]);
  const resource = useResource(loader);
  const namesLoader = useCallback(() => api.doctors(), [api]);
  const names = useResource(namesLoader);
  const posts = resource.data?.filter((post) => post.pillar === pillar) || [];
  function moveTab(event, index) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % 6
        : event.key === 'ArrowLeft'
          ? (index + 5) % 6
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 5
              : null;
    if (next === null || busy) return;
    event.preventDefault();
    setPillar(PILLARS[next].key);
    tabs.current[next]?.focus();
  }
  return (
    <div className="page-enter education-page">
      <PageHeading title="Educación" eyebrow="TUS SEIS PILARES" />
      <div className="education-week">
        <Button
          variant="secondary"
          icon="back"
          aria-label="Semana anterior"
          disabled={busy}
          onClick={() => setWeek(addDays(week, -7))}
        />
        <Field
          label="Semana"
          type="date"
          value={week}
          max={doctor ? undefined : weekStart(today)}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) setWeek(weekStart(e.target.value));
          }}
        />
        <Button
          variant="secondary"
          icon="arrow"
          aria-label="Semana siguiente"
          disabled={busy || (!doctor && week >= weekStart(today))}
          onClick={() => setWeek(addDays(week, 7))}
        />
        <span>
          {formatDay(week)} al {formatDay(addDays(week, 6))}
        </span>
      </div>
      <div className="education-tabs" role="tablist" aria-label="Pilares de educación">
        {PILLARS.map((p, index) => (
          <button
            key={p.key}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`tab-${p.key}`}
            role="tab"
            aria-selected={pillar === p.key}
            aria-controls={`education-${p.key}`}
            tabIndex={pillar === p.key ? 0 : -1}
            disabled={busy}
            onKeyDown={(e) => moveTab(e, index)}
            onClick={() => setPillar(p.key)}
          >
            <Icon name={p.icon} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`education-${pillar}`}
        aria-labelledby={`tab-${pillar}`}
        tabIndex={0}
        className="education-content"
      >
        <ErrorNotice message={resource.error} retry={resource.reload} />
        {resource.loading ? (
          <Loading />
        ) : (
          !resource.error &&
          (doctor ? (
            <EducationEditor
              key={`${week}-${pillar}`}
              post={posts[0]}
              week={week}
              pillar={pillar}
              api={api}
              doctorId={profile.id}
              onBusy={setBusy}
              onSaved={async () => {
                notify('Contenido guardado.');
                await resource.reload();
              }}
            />
          ) : posts.length ? (
            posts.map((post) => (
              <article className="education-post" key={post.id}>
                <Badge>
                  {names.data?.find((name) => name.id === post.doctor_id)?.full_name ||
                    'Tu equipo de salud'}
                </Badge>
                <h2>{post.title}</h2>
                <div className="education-text">{post.content}</div>
              </article>
            ))
          ) : (
            <Empty
              title="Sin publicaciones esta semana"
              icon={PILLARS.find((p) => p.key === pillar).icon}
            />
          ))
        )}
      </section>
    </div>
  );
}

function EducationEditor({ post, week, pillar, api, doctorId, onBusy, onSaved }) {
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [published, setPublished] = useState(post?.published ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      await api.saveEducation(doctorId, { week_start: week, pillar, title, content, published });
      await onSaved();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <Field
          label="Título de la publicación"
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Field label="Contenido">
          {(id) => (
            <textarea
              id={id}
              rows={12}
              required
              maxLength={12000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
        </Field>
        <label className="education-publish">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />{' '}
          Publicado para mis pacientes en esta semana
        </label>
        <ErrorNotice message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar contenido'}
        </Button>
      </fieldset>
    </form>
  );
}
