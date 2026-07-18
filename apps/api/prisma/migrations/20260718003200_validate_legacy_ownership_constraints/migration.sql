DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM outbox_events WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'cannot validate outbox_events organization ownership';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM outbox_events AS event
    LEFT JOIN organizations AS organization ON organization.id = event.organization_id
    WHERE organization.id IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot validate outbox_events organization reference';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM job_executions AS execution
    LEFT JOIN organizations AS organization ON organization.id = execution.organization_id
    LEFT JOIN outbox_events AS event ON event.id = execution.event_id
    WHERE execution.organization_id IS NULL
       OR execution.event_id IS NULL
       OR organization.id IS NULL
       OR event.id IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot validate job_executions ownership or event reference';
  END IF;
END;
$$;

ALTER TABLE "outbox_events"
  VALIDATE CONSTRAINT "outbox_events_organization_id_fkey";
ALTER TABLE "outbox_events"
  VALIDATE CONSTRAINT "outbox_events_organization_id_required";
ALTER TABLE "job_executions"
  VALIDATE CONSTRAINT "job_executions_organization_id_fkey";
ALTER TABLE "job_executions"
  VALIDATE CONSTRAINT "job_executions_organization_id_required";
ALTER TABLE "job_executions"
  VALIDATE CONSTRAINT "job_executions_event_id_fkey";
ALTER TABLE "job_executions"
  VALIDATE CONSTRAINT "job_executions_event_id_required";
