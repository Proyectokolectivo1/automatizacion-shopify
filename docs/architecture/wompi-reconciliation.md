# Conciliación Wompi simulada

Actualizado: 2026-07-14

## Objetivo

E2-H6A compara diariamente cada intención Wompi elegible con el último evento aceptado y con el
estado authoritative del `WompiProvider`. La vertical detecta diferencias; no corrige importes,
estados ni pedidos.

## Flujo

1. El scheduler busca tiendas con intenciones Wompi cuyo checkpoint esté vencido.
2. Un advisory lock por organización/tienda serializa ejecuciones concurrentes.
3. La ventana comienza en el último final exitoso; en la primera ejecución usa el lookback
   configurado. Las intenciones pendientes y las que conservan incidencias abiertas siempre se
   revisan.
4. Por intención se compara referencia, monto, moneda, identificador y estado authoritative, además
   del último evento `ACCEPTED`.
5. Las diferencias se guardan con una huella SHA-256 estable por intención/tipo. Un replay incrementa
   el contador de detección en vez de crear filas nuevas.
6. La ejecución persiste un reporte agregado sin PII, resuelve diferencias ausentes, emite una alerta
   outbox si existen diferencias y solo entonces avanza el checkpoint.

Una caída del proveedor crea un reporte `FAILED`, incrementa fallos consecutivos y programa un
reintento corto. La ventana exitosa no avanza.

## Controles

- `WOMPI_RECONCILIATION_ENABLED=false` y kill switch activo por defecto.
- El modo debe ser `simulation`; también deben estar habilitados los controles base de Wompi.
- Checkpoint, reporte, incidencia, auditoría y outbox son tenant-safe.
- El reporte solo contiene IDs internos, conteos, tipos, ventana y modo.
- El proveedor real permanece `BLOQUEADO_POR_CREDENCIALES`.

## Límite conocido

El scheduler vive en el proceso API. Los locks permiten concurrencia segura, pero deberá trasladarse
a `worker-payments` antes de escalar horizontalmente la operación.
