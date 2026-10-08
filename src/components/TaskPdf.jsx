import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/api';
import { Button, ErrorNotice, Loading, Modal } from './ui';

export default function TaskPdf({ api, task }) {
  const [open, setOpen] = useState(false);
  if (!task.attachment_path) return null;
  return (
    <>
      <Button
        variant="secondary"
        className="task-pdf-button"
        icon="download"
        onClick={() => setOpen(true)}
      >
        Ver PDF
      </Button>
      {open && <PdfReader api={api} task={task} onClose={() => setOpen(false)} />}
    </>
  );
}

function PdfReader({ api, task, onClose }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    api
      .taskPdf(task)
      .then((value) => {
        objectUrl = value;
        if (cancelled) {
          if (value.startsWith('blob:')) URL.revokeObjectURL(value);
        } else setUrl(value);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      });
    return () => {
      cancelled = true;
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [api, task, attempt]);
  return (
    <Modal title="Guía de la actividad" onClose={onClose} wide>
      <p className="pdf-filename">{task.attachment_name}</p>
      <ErrorNotice
        message={error}
        retry={() => {
          setError('');
          setUrl('');
          setAttempt((n) => n + 1);
        }}
      />
      {!url && !error && <Loading label="Abriendo PDF…" />}
      {url && (
        <>
          <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
            Abrir PDF en otra pestaña
          </a>
          <iframe className="pdf-reader" src={url} title={`PDF: ${task.attachment_name}`} />
        </>
      )}
    </Modal>
  );
}
