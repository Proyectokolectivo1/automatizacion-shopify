# Contrato de eventos de fundación

Actualizado: 2026-07-12

## Evento

- Nombre: `foundation.organization.created`.
- Versión: `1`.
- Identificador y `jobId`: UUID de `outbox_events.id`.
- Correlación: `correlation_id`, obligatoria y propagada al job.
- Agregado: tipo `organization` e identificador UUID.
- Payload: JSON con `schemaVersion: 1` y `organizationId`.

La entrega es al menos una vez; los consumidores deben ser idempotentes. El `jobId` evita insertar el
mismo evento mientras el registro BullMQ permanezca retenido, pero no reemplaza la idempotencia del
consumidor. Los errores persistidos son categorías redactadas, nunca el mensaje crudo del proveedor.

El campo `simulateFailure: true` está reservado para fixtures de prueba y fuerza reintentos/DLQ en
modo simulación. No representa un contrato funcional de negocio.
