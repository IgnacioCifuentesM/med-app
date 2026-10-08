import { useCallback } from 'react';
import { useResource } from '../hooks/useResource';
import { Badge, Button, Empty, ErrorNotice, Loading, PageHeading } from '../components/ui';
import TaskPdf from '../components/TaskPdf';
import { TASK_TYPES } from '../lib/domain';

export default function Guides({ api, profile }) {
  const loader = useCallback(() => api.patientTasks(profile.id), [api, profile.id]);
  const resource = useResource(loader);
  const guides = (resource.data || []).filter((task) => task.attachment_path);
  return (
    <div className="page-enter">
      <PageHeading
        title="Mis guías"
        eyebrow="ARCHIVOS DE MI EQUIPO"
        action={
          <Button
            variant="secondary"
            icon="arrow"
            disabled={resource.loading}
            onClick={resource.reload}
          >
            Actualizar
          </Button>
        }
      />
      <ErrorNotice message={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading label="Cargando guías…" />
      ) : (
        !resource.error &&
        (guides.length ? (
          <div className="patient-guides">
            {guides.map((task) => (
              <article className="guide-row" key={task.id}>
                <div>
                  <Badge tone="blue">{TASK_TYPES[task.task_type]?.name || 'Actividad'}</Badge>
                  <h2>{task.title}</h2>
                  <p>{task.attachment_name}</p>
                  {task.description && <p>{task.description}</p>}
                  {task.archived_at && <small>Actividad archivada</small>}
                </div>
                <TaskPdf api={api} task={task} />
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Todavía no tienes guías adjuntas" icon="download">
            Tu equipo aún no ha adjuntado un PDF a tus actividades.
          </Empty>
        ))
      )}
    </div>
  );
}
