# Contrato de eventos de fundación

Actualizado: 2026-07-14

## Evento

- Nombre: `foundation.organization.created`.
- Versión: `1`.
- Identificador: UUID de `outbox_events.id`.
- `jobId`: `<eventId>-v<deliveryVersion>`; cada reproceso incrementa la versión.
- Tenant: `organization_id` obligatorio para toda escritura nueva y propagado al job.
- Correlación: `correlation_id`, obligatoria y propagada al job.
- Agregado: tipo `organization` e identificador UUID.
- Payload: JSON con `schemaVersion: 1` y `organizationId`.

La entrega es al menos una vez; los consumidores deben ser idempotentes. El `jobId` evita insertar el
mismo evento mientras el registro BullMQ permanezca retenido, pero no reemplaza la idempotencia del
consumidor. Los errores persistidos son categorías redactadas, nunca el mensaje crudo del proveedor.

Un fallo final del consumidor mueve de forma transaccional `job_executions` y `outbox_events` a
`dead_letter`. Un reproceso crea una generación de entrega nueva; un job antiguo no puede cambiar el
estado de una generación posterior.

El campo `simulateFailure: true` está reservado para fixtures de prueba y fuerza reintentos/DLQ en
modo simulación. No representa un contrato funcional de negocio.
