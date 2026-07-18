# Prompt para la siguiente sesión

Actualizado: 2026-07-18

Continúa en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está `EN_DESARROLLO`;
no está listo para piloto ni producción. E0-H1..H6A, E1-H1A..H5C (implementación local 100 %),
E2-H1A..H6A, E3-H1A..H8A, E6-H1A..H7A, E7-H1A y E9-H1A..H5A están completas. E0-H6B es la
siguiente vertical local propuesta.

Repositorio: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. Rama
`codex/foundations-e0-h2`, PR borrador #1. El avance publicado llega a E6-H4A (`3ed4dfc`);
E6-H5A..H7A, E9-H1A..H5A, E3-H8A, E0-H3C/H4D/H5D/H6A, E1-H1B..H5C y E7-H1A están validadas
localmente y pendientes de publicación autorizada. GitHub CLI usa keyring. No usar el PAT expuesto y
no hacer commit/push sin petición explícita.

Usa siempre `token-optimizer` en modo Codex read-only. No instales hooks, compact prompt, status line
ni configuración global sin aprobación. Lee controles vivos, `PROJECT_OVERVIEW.md`, `SESSION_LOG.md`,
continuidad y documentación E6-H1A/H2A/H3A antes de editar.

## Baseline

- `pnpm validate`: 105 pruebas totales; API 24 archivos/92 pruebas y 100 % crítico, web 13/13.
- `pnpm auth:verify`: 16/16; `pnpm operations:verify`: 12/12.
- `pnpm alerts:verify`: 7/7; `pnpm database:verify`: 16/16; 33/33 migraciones y cero drift.
- `pnpm backup:verify`: 39 tablas/33 migraciones equivalentes; cleanup de base y dump confirmado.
- `pnpm load:verify`: 500 pedidos/1.500 transiciones, 50 replays, cero errores/DLQ y cleanup.
- `pnpm security:verify`: 486 archivos/402 dependencias; cero secretos high-confidence o high/critical.
- `pnpm release:smoke`: API 2.065 ms/web 910 ms, migraciones no-op y shutdown limpio.
- `pnpm observability:verify`: Redis/alertas/reinicio API/Collector dentro de presupuestos 15 s/30 s.
- `pnpm whatsapp:verify`: 26/26, incluida purga irreversible de contenido vencido.
- `pnpm architecture:verify`: 123 archivos/529 imports, cinco colaboraciones y ocho fixtures.
- `pnpm finance:verify`: 4/4 PostgreSQL/HTTP, incluido BIGINT >MAX_SAFE, vacío, límites y kill switch.
- Todos los gates Shopify/Wompi/WhatsApp, outbox/DLQ/identity/integración, infraestructura,
  observabilidad y `pnpm audit --prod` están verdes.
- Shopify local está implementado al 100 % sobre GraphQL 2026-07: scopes orders/inventory/locations,
  webhooks/overlap, pedidos paginados, MARK/CANCEL y scheduler. La verificación development real está
  `BLOQUEADO_POR_CREDENCIALES` y no debe marcarse como ejecutada sin evidencia.
- El compose debe quedar detenido con volúmenes persistentes al cerrar.

## Garantías E6-H3A

- Next.js es BFF; los tokens solo viven en cookies HttpOnly/SameSite/Secure en producción.
- Crear/rotar/revocar sesión exige Origin exacto y, con sesión, CSRF double-submit.
- Login ofrece únicamente membresías activas después de verificar credenciales/rate limit.
- Cada lectura deriva organización de `/auth/me`; nunca confiar en tenant enviado/guardado por web.
- La proyección web elimina email, IDs de recursos/tienda, relaciones, PII y cuerpos.
- CSP permite `unsafe-eval` solo en desarrollo; producción fue comprobada sin esa fuente.

## Garantías E6-H4A

- Cinco reglas inmutables v1 reutilizan `requires_attention`; no existe SLA ni severidad inventada.
- Scheduler y evaluador usan lote/ventana acotados, locks tenant y una lectura agregada por lote.
- PostgreSQL conserva ciclos open/resolved y un índice parcial impide dos alertas abiertas por regla.
- La API pública solo ofrece reglas/listado owner/admin/operations con cursor, filtros y `no-store`.
- Alertas, auditoría y métricas no contienen PII, IDs fuente, payloads ni cardinalidad libre.
- Flags/kill switch fallan cerrados; no hay notificaciones, autocorrección, exportación o proveedor real.

## Garantías E6-H5A

- Busca solo ID interno exacto, tipo, estado y motivo operativo; nunca PII, cuerpos o referencias.
- `from`/`to` son obligatorios, `[from,to)` máximo 31 días; límite máximo 50.
- Ranking estable: ID exacto, campo exacto, prefijo y contenido; cursor ligado a consulta/filtros.
- Solo owner/admin/operations; auditoría omite `q` y Prometheus usa únicamente `outcome`.
- El BFF deriva tenant y elimina `itemId`/`matchKind`; flag y kill switch independientes fallan cerrados.

## Garantías E6-H6A

- API discriminada por cinco tipos, allowlist estricta, timeline máximo 25 y 404 uniforme.
- No selecciona JSON libre, PII, actores, UUID relacionados, cuerpos, snapshots ni referencias externas.
- BFF cifra UUID/tipo/tenant con AES-256-GCM, AAD y TTL 15 minutos; valida tenant de `/auth/me`.
- Producción exige `WEB_DETAIL_REFERENCE_KEY`; feature/kill switch independientes fallan cerrados.
- Dashboard muestra detalle accesible sin UUID; auditoría y métrica usan únicamente campos acotados.

## Garantías E6-H7A

- Solo owner/admin; máximo 7 días y 1.000 filas, cinco columnas operativas sin IDs/PII.
- API entrega JSON validado; BFF genera CSV BOM/CRLF/RFC 4180 exclusivamente en memoria.
- Fórmulas se neutralizan aun tras espacios; botón se deshabilita durante búsqueda o rango >7 días.
- Rate limit durable por usuario+tenant+IP, auditoría sin filas, métrica acotada y kill switch propio.

## Garantías E9-H1A

- `pg_dump` custom y `pg_restore --single-transaction --exit-on-error` usan PostgreSQL 17 de Compose.
- El restore ocurre en una base aleatoria distinta a la fuente y compara filas, migraciones,
  constraints, índices y secuencias.
- Dump `0600` y base temporal se eliminan antes del éxito; el reporte ignorado no contiene datos.
- Segunda medición local: backup 360 ms, restore 890 ms, verificación 323 ms y total 3.523 ms.
- No existe todavía backup externo, retención productiva ni RPO/RTO contractual.

## Garantías E9-H2A

- 500 webhooks HTTP/HMAC con concurrencia 25 acumulan exactamente 500 eventos antes del recovery.
- Cuatro publicadores y worker 50 completan sync+clasificación; 50 replays no duplican recursos.
- Medición final: 140,36 req/s, p95 251 ms y drain 7.843 ms a 63,75 pedidos/s, cero error/DLQ.
- Sync/clasificación usan READ COMMITTED + advisory lock por pedido + retry; sus gates están verdes.
- Base/colas/reporte son aislados o ignorados; el resultado no dimensiona producción.

## Garantías E9-H3A

- Siete detectores con self-test escanean archivos Git/candidatos sin imprimir valores.
- Artefactos/ignore, versiones/lifecycle, lockfile, CI, Compose y headers/CSP pasan fail-closed.
- Audit de 402 dependencias productivas: cero vulnerabilidades conocidas; checkout no persiste token.
- Tags SHA, CSP inline, SAST/DAST/pentest/TLS/secret manager/infra objetivo siguen abiertos.

## Garantías E9-H4A/H5A

- `release:smoke` arranca artefactos productivos locales, verifica readiness/headers/BFF/métricas y
  cierra procesos/puertos; rollback real/TLS/deploy no se ejecutaron.
- El drill usa puerto/tokens efímeros y restaura Redis/Collector en `finally`.
- Medición: readiness down 692 ms, firing 972 ms, reinicio conserva un solo firing, readiness up
  6.265 ms, resolved 6.534 ms y Collector 3.693 ms. Son gates locales, no SLO productivos.

## Garantías E3-H8A/E0-H4D

- Solo ciphertext/fingerprint inbound vencidos pasan una vez a nulo; mensaje/sender hash/evidencia se
  conservan. Trigger, lock, `SKIP LOCKED`, auditoría agregada y métricas están probados.
- La migración 32 validó seis constraints legacy después de preflight; 33/33 y cero no validadas.

## Garantías E0-H5D

- Revocar una membresía libera todas sus conversaciones asignadas dentro de la misma transacción.
- Cada conversación incrementa versión y registra historial `UNASSIGN/MEMBERSHIP_REVOKED` y outbox.
- El lock por organización serializa revocación y claim; replay no duplica versiones/historial/eventos.
- Una membresía ya revocada puede sanar asignaciones legacy con una clave nueva; tenant ajeno no cambia.

## Garantías E0-H3C

- Antes del primer baseline, la API consulta `/api/v2/alerts` y solo adopta alertas técnicas propias.
- Estado activo sigue sin firing duplicado; recuperación emite solo resolved preservando `startsAt`.
- Respuesta inválida, excesiva o fallo de red no establece baseline y se reintenta sin afectar health.
- Las llamadas concurrentes comparten una hidratación; el gate reinicia la API con Redis todavía caído.

## Garantías E1-H5C

- La inspección de incidencias ordena por `firstDetectedAt DESC, id DESC` y usa `limit + 1`.
- El cursor base64url está ligado al filtro de estado; alteración, UUID inválido o cambio de filtro da 400.
- Una inserción concurrente posterior no contamina la secuencia iniciada ni repite elementos.

## Garantías E0-H6A

- Raíces de composición cablean; plataforma nunca importa dominios; módulos nuevos fallan cerrados.
- Solo cinco colaboraciones dominio-dominio exactas están permitidas y todas deben seguir ejercidas.
- El gate reconoce imports/exports/dynamic/require relativos y rechaza escapes fuera de `api/src`.
- Ocho fixtures demuestran allow/deny; `architecture:verify` forma parte de `validate` y CI.

## Garantías E7-H1A

- Resume intenciones Wompi/COP simuladas, no recaudo, ingreso, costo, saldo ni rentabilidad.
- Ventana `[from,to)` máxima 31 días, una consulta tenant-bounded y respuesta `no-store`.
- Solo owner/admin/finance; flag/kill switch fail-closed y auditoría/métrica sin importes o IDs.
- `amountMinor` es decimal string exacto; conteos fuera de safe integer fallan cerrados.

## Siguiente vertical propuesta: E0-H6B

Inspecciona primero la duplicación real del protocolo de idempotencia en dos servicios representativos.
Extrae una primitiva incremental solo si conserva exactamente scope, request hash, replay, estado
`IN_PROGRESS/COMPLETED`, respuesta snapshot y semántica transaccional. Prueba payload distinto, carrera,
rollback y replay antes de ampliar a otro dominio; no hagas un refactor masivo ni una abstracción que
oculte locks o side effects. Cierra TD-021 únicamente con equivalencia demostrada.

TD-003/015/016/024/025 quedaron resueltas; conserva TD-026 y los bloqueos externos. Costos/rentabilidad
E7 siguen `BLOQUEADO_POR_DECISION`. No borres volúmenes, no despliegues ni presentes mocks como
integraciones reales.
