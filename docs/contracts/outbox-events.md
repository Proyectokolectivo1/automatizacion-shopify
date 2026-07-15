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

## Eventos Shopify

- `shopify.webhook.received.v1`: ordena consultar el recurso indicado por un webhook verificado. No
  contiene el cuerpo ni el identificador externo en su payload; el worker los resuelve desde el
  agregado tenant-safe. E1-H5A también puede emitirlo desde una incidencia `MISSING_ORDER` con
  `payload.source=reconciliation`; el evento persistido queda marcado `reconciliation_generated`
  y nunca se presenta como firma HMAC válida.
- `shopify.order.synchronized.v1`: confirma una creación o actualización efectiva del snapshot.
  Incluye IDs internos de pedido/tienda, `provider=shopify`, `mode=simulation` y
  `fixtureVersion=v1`.
- `order.classified.v1`: confirma una clasificación efectiva. Incluye IDs internos de pedido/tienda,
  modo de pago, estado destino, versión e identificador de regla, siempre con `mode=simulation`.

Un replay del mismo webhook o un snapshot tardío no emite un segundo evento de pedido.

## Eventos de tarifas

- `transport.rate_policy.activated.v1`: confirma activación de una versión y alcance de política, sin
  incluir reglas completas ni datos personales.
- `order.transport_rate.resolved.v1`: confirma una decisión durable e incluye IDs internos, importe
  menor, moneda COP, versión/regla ganadora y `mode=simulation`.

La decisión, actualización monetaria y evento de resolución se escriben en una sola transacción. Un
replay idempotente no emite un segundo evento.

## Eventos de pago

- `payment.intent.created.v1`: intención Wompi sintética persistida. Incluye IDs internos, importe,
  COP, expiración, proveedor, modo y versión del fixture; nunca incluye URL, firma o secretos.

Una intención y su evento se crean en la misma transacción. Replays no emiten eventos adicionales.
