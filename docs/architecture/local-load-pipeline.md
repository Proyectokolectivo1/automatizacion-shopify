# Carga local del pipeline simulado E9-H2A

`pnpm load:verify` crea una base migrada y dos colas Redis con nombres aleatorios. Registra una tienda
simulada por HTTP, firma 500 webhooks `orders/create` sintéticos y los envía con concurrencia 25. El
publicador permanece cerrado durante el ingreso, por lo que PostgreSQL debe conservar exactamente 500
eventos outbox pendientes antes de la recuperación.

La recuperación usa cuatro publicadores que reclaman lotes con `FOR UPDATE SKIP LOCKED` y un worker
BullMQ de concurrencia 50. Cada notificación atraviesa:

1. HMAC y persistencia HTTP del webhook;
2. outbox durable y publicación Redis;
3. consulta al proveedor mock, normalización y persistencia completa del pedido;
4. segundo evento outbox y clasificación de pago/estado;
5. tres transiciones históricas hasta `READY_FOR_LOGISTICS`.

Los locks advisory conservan exclusión por pedido. E9-H2A cambió sync y clasificación de
`SERIALIZABLE` a `READ COMMITTED`: las transacciones escriben agregados independientes y ya poseen lock
por clave; serializable causaba falsos conflictos `P2034` entre pedidos distintos. Se mantienen
atomicidad, constraints, idempotencia y cinco reintentos exponenciales para conflictos/deadlocks.

El fixture parametrizable acepta únicamente IDs `9000000000001` a `9000000000500`; cualquier otro ID
no incluido en el fixture base falla cerrado. El reporte persistente solo contiene métricas agregadas
y queda bajo `.artifacts/`, fuera de Git.

Esta prueba dimensiona el Compose local y el modo simulado. No mide latencia de Shopify/Wompi/Meta,
red pública, infraestructura productiva, alta disponibilidad ni capacidad comercial garantizada.
