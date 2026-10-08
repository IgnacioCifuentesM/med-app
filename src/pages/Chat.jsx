import { useCallback, useEffect, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { friendlyError } from '../lib/api';
import { CHAT_MAX_LENGTH } from '../lib/chat';
import { Button, Empty, ErrorNotice, Loading, PageHeading } from '../components/ui';

export default function Chat({ api, profile, navigate }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', offset: 0 });
  const [contact, setContact] = useState(null);
  const loader = useCallback(
    () => api.chatContacts(profile, query.search, query.offset),
    [api, profile, query],
  );
  const contacts = useResource(loader);
  const refreshContacts = contacts.reload;
  useEffect(() => {
    if (profile.role !== 'doctor') return;
    let active = true;
    let timer;
    const refresh = async () => {
      if (document.visibilityState === 'visible') await refreshContacts();
      if (active) timer = setTimeout(refresh, 30000);
    };
    timer = setTimeout(refresh, 30000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile.role, refreshContacts]);
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="CONVERSACIONES PRIVADAS"
        title={profile.role === 'doctor' ? 'Chat con mis pacientes' : 'Chat con mi médico'}
      >
        Pregunta y recibe la respuesta de tu profesional de salud.
      </PageHeading>
      <div className="notice chat-retention">
        <p>
          Los mensajes duran 3 días. Conservamos siempre los últimos 2 de cada conversación. Las
          respuestas dependen de la disponibilidad del profesional.
        </p>
      </div>
      <div className="chat-layout">
        <section className="panel chat-contacts" aria-label="Contactos de chat">
          <form
            className="chat-search"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery({ search: search.trim(), offset: 0 });
            }}
          >
            <label htmlFor="chat-search">
              {profile.role === 'doctor' ? 'Buscar paciente' : 'Buscar médico'}
            </label>
            <input
              id="chat-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              type="search"
            />
            <Button type="submit" variant="secondary" disabled={contacts.loading}>
              Buscar
            </Button>
          </form>
          <ErrorNotice message={contacts.error} retry={contacts.reload} />
          {contacts.loading && !contacts.data && <Loading />}
          {!contacts.loading && !contacts.error && contacts.data?.items.length === 0 && (
            <Empty
              title={query.search ? 'Sin coincidencias' : 'Aún no hay contactos'}
              action={
                profile.role === 'patient' && !query.search ? (
                  <Button onClick={() => navigate('profile')}>Elegir mi médico</Button>
                ) : undefined
              }
            >
              {query.search
                ? 'Prueba con otro nombre.'
                : profile.role === 'patient'
                  ? 'Selecciona un profesional en tu equipo de salud para conversar.'
                  : 'Aquí aparecen los pacientes vinculados a tu cuenta.'}
            </Empty>
          )}
          <ul className="chat-contact-list">
            {contacts.data?.items.map((person) => (
              <li key={person.id}>
                <button
                  className={`chat-contact${contact?.id === person.id ? ' active' : ''}${person.pending_reply ? ' pending-reply' : ''}`}
                  aria-pressed={contact?.id === person.id}
                  onClick={() => setContact(person)}
                >
                  <strong>{person.full_name}</strong>
                  <span>{person.role === 'doctor' ? 'Profesional de salud' : 'Paciente'}</span>
                  {person.pending_reply && (
                    <span className="pending-reply-label">Pendiente de respuesta</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="chat-actions">
            {query.offset > 0 && (
              <Button
                variant="secondary"
                disabled={contacts.loading}
                onClick={() => setQuery((q) => ({ ...q, offset: Math.max(0, q.offset - 30) }))}
              >
                Anterior
              </Button>
            )}
            {contacts.data?.has_more && (
              <Button
                variant="secondary"
                disabled={contacts.loading}
                onClick={() => setQuery((q) => ({ ...q, offset: q.offset + 30 }))}
              >
                Siguiente
              </Button>
            )}
          </div>
        </section>
        {contact ? (
          <Conversation key={contact.id} {...{ api, profile, contact }} onSent={refreshContacts} />
        ) : (
          <section className="panel">
            <Empty icon="chat" title="Elige una conversación">
              Selecciona a quién quieres escribir.
            </Empty>
          </section>
        )}
      </div>
    </div>
  );
}

function Conversation({ api, profile, contact, onSent }) {
  const [before, setBefore] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const retryMessage = useRef(null);
  const end = useRef(null);
  const loader = useCallback(
    () => api.chatMessages(profile, contact, before),
    [api, profile, contact, before],
  );
  const messages = useResource(loader);
  const refreshMessages = messages.reload;
  useEffect(() => {
    if (before) return;
    let active = true;
    let timer;
    const refresh = async () => {
      if (document.visibilityState === 'visible') await refreshMessages();
      if (active) timer = setTimeout(refresh, 30000);
    };
    timer = setTimeout(refresh, 30000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [before, refreshMessages]);
  const newestId = messages.data?.items.at(-1)?.id;
  useEffect(() => {
    if (!before) end.current?.scrollIntoView({ block: 'nearest' });
  }, [before, newestId]);
  async function send(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    if (retryMessage.current?.body !== text)
      retryMessage.current = { id: crypto.randomUUID(), body: text };
    setSending(true);
    setError('');
    try {
      await api.sendChat(profile, contact, retryMessage.current.id, text);
      retryMessage.current = null;
      setBody('');
      await messages.reload();
      await onSent();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSending(false);
    }
  }
  return (
    <section
      className="panel chat-conversation"
      aria-label={`Conversación con ${contact.full_name}`}
    >
      <div className="chat-heading">
        <h2>{contact.full_name}</h2>
        <Button
          variant="secondary"
          disabled={messages.loading || sending}
          onClick={() => {
            if (before) setBefore(null);
            else void messages.reload();
          }}
        >
          {before ? 'Ver recientes' : 'Actualizar'}
        </Button>
      </div>
      <ErrorNotice message={messages.error} retry={messages.reload} />
      <div className="chat-messages" aria-label="Mensajes">
        {messages.loading && !messages.data && <Loading />}
        {messages.data?.has_more && (
          <Button
            variant="secondary"
            disabled={messages.loading || sending}
            onClick={() => setBefore(messages.data.items[0].seq)}
          >
            Ver mensajes anteriores
          </Button>
        )}
        {!messages.loading && !messages.error && messages.data?.items.length === 0 && (
          <Empty title="Empieza la conversación" icon="chat">
            Escribe tu primera pregunta o respuesta.
          </Empty>
        )}
        {messages.data?.items.map((message) => {
          const mine = message.sender_id === profile.id;
          return (
            <article className={mine ? 'chat-message mine' : 'chat-message'} key={message.id}>
              <span className="chat-author">{mine ? 'Tú' : contact.full_name}</span>
              <p>{message.body}</p>
              <time dateTime={message.created_at}>
                {new Intl.DateTimeFormat('es-CL', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: profile.timezone || 'America/Santiago',
                }).format(new Date(message.created_at))}
              </time>
            </article>
          );
        })}
        <div ref={end} />
      </div>
      <ErrorNotice message={error} />
      {before ? (
        <p className="microcopy">Vuelve a los mensajes recientes para responder.</p>
      ) : (
        <form className="chat-compose" onSubmit={send}>
          <label htmlFor="chat-message">Tu mensaje</label>
          <textarea
            id="chat-message"
            rows={3}
            maxLength={CHAT_MAX_LENGTH}
            value={body}
            disabled={sending}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe aquí…"
            required
          />
          <div className="chat-actions">
            <small>
              {body.length}/{CHAT_MAX_LENGTH}
            </small>
            <Button type="submit" icon="arrow" disabled={sending || !body.trim()}>
              {sending ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        </form>
      )}
      <p className="microcopy">
        Este chat no se atiende de inmediato. Si necesitas ayuda urgente, usa los canales de
        atención de tu centro de salud.
      </p>
    </section>
  );
}
