# Reconciliación de pedidos Shopify

## Objetivo

E1-H5A compara una ventana acotada del proveedor Shopify con el estado durable local y registra
incidencias operativas sin ejecutar pagos, logística ni mutaciones remotas. En esta etapa solo se
habilita el proveedor simulado.

## Flujo

1. Un operador autorizado solicita una ventana `[windowStartedAt, windowEndedAt)` para una tienda.
2. `ShopifyProvider.listOrders` pagina los identificadores del proveedor desde el cursor durable.
3. El servicio compara esos identificadores con pedidos locales y, en paralelo, busca webhooks en
   `FAILED`/`DEAD_LETTER` y pedidos `RECEIVED` que superaron el umbral de atasco.
4. Cada señal se convierte en una incidencia con fingerprint único por tienda, tipo y recurso. Una
   ejecución repetida incrementa el contador, pero no duplica la incidencia abierta.
5. El checkpoint guarda cursor, ventana y resultado de la última ejecución.
6. El reproceso bloquea la incidencia y registra idempotencia dentro de una transacción serializable.
   Un pedido faltante genera un evento interno explícito y su outbox; un evento fallido vuelve a
   publicar únicamente su outbox terminal con una versión de entrega nueva.
7. El pipeline existente sincroniza y clasifica el pedido. Una conciliación posterior resuelve la
   incidencia cuando desaparece la condición subyacente.

## Persistencia

- `reconciliation_checkpoints`: cursor y última ventana por organización/tienda.
- `order_reconciliation_issues`: tipo, estado, fingerprint, referencias y contador de detecciones.
- `webhook_events.reconciliation_generated`: distingue recuperación interna de ingreso HMAC real.
- `idempotency_keys`, `outbox_events` y `audit_logs`: reutilizados para replay y trazabilidad.

Los constraints impiden que un webhook interno se presente como firma válida. El sincronizador solo
acepta HMAC verificado o un evento marcado explícitamente como generado por reconciliación.
La inspección pagina por `firstDetectedAt` inmutable+UUID y liga cada cursor al filtro de estado.

## Límites actuales

- Simulation/live deben coincidir con el modo global; la evidencia remota sigue bloqueada por credenciales.
- Existe scheduler multi-tienda fail-closed y se conserva ejecución manual autenticada para diagnóstico.
- Ventana máxima configurable, 24 horas por defecto, y hasta 100 incidencias por consulta.
- No se guarda payload Shopify crudo ni PII adicional en las incidencias.
