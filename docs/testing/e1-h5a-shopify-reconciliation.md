# Evidencia de pruebas E1-H5A

La suite `pnpm shopify:reconciliation:verify` levanta una base PostgreSQL temporal, aplica todas las
migraciones y ejecuta la API NestJS con proveedor Shopify mutable en simulación.

Casos cubiertos:

1. Detecta un pedido ausente, persiste checkpoint y una única incidencia; `READ_ONLY` recibe 403 y
   `OPERATIONS` puede ejecutar e inspeccionar sin ver payload.
2. Dos reprocesos concurrentes con la misma clave responden 202, crean un solo webhook interno y un
   solo outbox. La sincronización posterior crea el pedido y una nueva conciliación resuelve el caso.
3. Detecta un webhook en dead letter y rearma únicamente el outbox de su organización con una
   versión de entrega nueva.
4. Pagina por clave inmutable sin duplicados, excluye una inserción concurrente y rechaza cursor
   inválido o ligado a otro filtro.

La suite de base `pnpm database:verify` verifica además 33 migraciones, constraints del checkpoint,
consistencia de resolución y exclusión mutua entre firma válida y evento interno.

No se usa Shopify real ni PII. El pipeline Redis compartido ya está cubierto por
`pnpm shopify:webhooks:verify`; esta suite se concentra en HTTP, PostgreSQL y el punto de reentrada
outbox.
