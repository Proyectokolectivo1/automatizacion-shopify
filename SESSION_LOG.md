# Registro cronológico de sesiones

Actualizado: 2026-07-17

Este archivo es append-only: cada sesión de desarrollo agrega una entrada al final. No reemplaza los
nueve controles obligatorios; conserva el relevo cronológico entre sesiones y enlaza la evidencia
reproducible. El protocolo completo está en `docs/architecture/project-continuity.md`.

## 2026-07-12 — fundaciones E0

- Se creó desde un repositorio vacío el monorepo pnpm/Turborepo con API NestJS y web Next.js.
- Se incorporaron CI, infraestructura local, observabilidad, Prisma, outbox, BullMQ, identidad y RBAC.
- Se creó `PROJECT_OVERVIEW.md` como resumen vivo exigible en cada sesión.
- Commits de cierre: `3a06eaa` a `72fc59e`.

## 2026-07-13 — identidad E0-H5B

- Se completaron invitaciones y recuperación de cuenta con tokens de un uso, expiración, revocación,
  concurrencia y correo simulado fail-closed.
- Commit de cierre: `9200342`.

## 2026-07-14 — operaciones, Shopify y pagos simulados

- Se completaron E0-H4C/E0-H5C, E1-H1A a E1-H5A y E2-H1A a E2-H6A.
- Se publicó la rama `codex/foundations-e0-h2` y se abrió el PR borrador #1.
- El pipeline validado cubre tienda Shopify simulada, ingreso y normalización de pedidos,
  clasificación, conciliación, tarifas COD, intención Wompi, webhook authoritative, recordatorios,
  vencimiento y conciliación diaria sin autocorrecciones.
- Commits de cierre: `e2f2234` a `9dc4e18`.
- Estado al iniciar la siguiente vertical: árbol limpio; `pnpm validate` verde con 50 pruebas unitarias,
  lint, typecheck y builds; E3-H1A es el siguiente trabajo.

## 2026-07-14 — sesión actual: E3-H1A

- Objetivo: configuración segura y proveedor WhatsApp exclusivamente simulados, sin enviar mensajes.
- Baseline inicial: `pnpm install --frozen-lockfile` y `pnpm validate` verdes.
- Se agregó protocolo de continuidad, registro append-only y se corrigió contexto vivo obsoleto.
- Se implementaron contrato/mock/fixture, token cifrado, configuración tenant-safe, ciclo operativo,
  outbox, auditoría, métricas, flags y kill switch.
- Evidencia: 55 unitarias, 4 HTTP/PostgreSQL WhatsApp, 12 de migración y 19 migraciones sin drift.
- Cierre: `pnpm validate`, todos los gates funcionales, observabilidad e infraestructura verdes;
  auditoría npm sigue bloqueada por HTTP 410 del endpoint retirado.
- Bloqueo: Meta real continúa `BLOQUEADO_POR_CREDENCIALES`; no hubo tráfico, mensajes ni PII real.
- Commit lógico: `feat: add simulated WhatsApp connection registry`; PR borrador #1.
- Siguiente vertical: E3-H2A, catálogo local de plantillas exclusivamente simulado.

## 2026-07-14 — sesión actual: E3-H2A

- Objetivo: catálogo local versionado de plantillas WhatsApp exclusivamente simulado.
- Baseline inicial: fuentes maestras sin cambios, árbol limpio y `pnpm validate` verde con 55 pruebas.
- Se agregó contrato/fixture v1, migración veinte, CRUD de lifecycle, listado y controles separados.
- Versiones inmutables, revisión `simulated_*`, activación única, tenant, RBAC, replay y carrera probados.
- Evidencia final: `pnpm validate`, 58 unitarias, 7 HTTP/PostgreSQL WhatsApp, 13 de migración sin
  drift, 14 gates previos, observabilidad e infraestructura verdes.
- Incidencias corregidas: regex PostgreSQL >255, `CHECK` JSON nullable y nombre de FK Prisma.
- Bloqueo: Meta real continúa `BLOQUEADO_POR_CREDENCIALES`; no hubo tráfico, mensajes ni PII real.
- `pnpm audit --prod` sigue bloqueado por HTTP 410 del endpoint retirado; no se marcó verde.
- Commit lógico: `feat: add simulated WhatsApp template catalog`; PR borrador #1.
- Siguiente vertical: E3-H3A, envío transaccional exclusivamente simulado.

## 2026-07-14 — sesión actual: E3-H3A

- Objetivo: envío transaccional WhatsApp durable exclusivamente simulado, sin tráfico Meta.
- Fuentes maestras verificadas sin cambios y baseline `pnpm validate` verde con 58 pruebas.
- Se agregó migración veintiuno, render tipado, API 202, proveedor determinista, conversación/mensaje,
  idempotencia HTTP y de negocio, RBAC, outbox, auditoría, métricas, flags y kill switch.
- El estado exclusivo `simulated_accepted` y constraints impiden afirmar envío/entrega/lectura real;
  respuesta, outbox, auditoría y métricas no contienen teléfono, cuerpo ni valores de variables.
- Evidencia final: `pnpm validate`, 63 unitarias, 10 HTTP/PostgreSQL WhatsApp, 14 de migración sin
  drift, 14 gates previos, observabilidad e infraestructura verdes.
- Incidencia corregida: parámetro sin tipo en el fixture SQL del test de duplicado.
- La migración 21 quedó aplicada a la base persistente local y `database:status` confirmó 21/21.
- `pnpm audit --prod` sigue bloqueado por HTTP 410 del endpoint retirado; no se marcó verde.
- Meta real continúa `BLOQUEADO_POR_CREDENCIALES`; no hubo llamadas, mensajes ni PII real.
- Commit lógico: `feat: add simulated WhatsApp transactional messaging`; PR borrador #1.
- Siguiente vertical: E3-H4A, estados y webhook WhatsApp exclusivamente simulados.

## 2026-07-14 — sesión actual: E3-H4A

- Objetivo: estados WhatsApp durables por webhook exclusivamente simulado, sin tráfico Meta.
- Fuentes maestras verificadas y baseline completo verde con 63 pruebas unitarias y 21 migraciones.
- Se agregaron fixture/contrato v1, HMAC de cuerpo crudo, secreto cifrado separado, evento e historial
  inmutables, máquina monotónica, outbox, auditoría, métricas, flags y kill switch.
- Replay, colisión, desconocidos, carrera, tardíos, terminales, RBAC, tenant y redacción están probados;
  ningún estado `simulated_*` representa confirmación Meta.
- Evidencia final: `pnpm validate`, 66 unitarias, 14 HTTP/PostgreSQL WhatsApp, 14 de migración sin
  drift, 14 gates previos, observabilidad e infraestructura verdes.
- Incidencias corregidas: unicidad compuesta Prisma, respuesta histórica E3-H3A tras cambio de estado
  y aserciones inseguras de lint en pruebas.
- Las migraciones 22/23 quedaron aplicadas a la base persistente y `database:status` confirmó 23/23.
- `pnpm audit --prod` sigue bloqueado por HTTP 410 del endpoint retirado; no se marcó verde.
- Meta real continúa `BLOQUEADO_POR_CREDENCIALES`; no hubo llamadas, credenciales ni PII real.
- Siguiente vertical: E3-H5A, mensajes entrantes WhatsApp exclusivamente simulados.

## 2026-07-15 — sesión actual: E3-H5A

- Objetivo: mensajes inbound durables exclusivamente simulados, sin tráfico Meta ni bandeja.
- Baseline: Docker Desktop estaba detenido; se inició sin borrar volúmenes y la regresión pasó.
- Se agregaron fixture/contrato inbound v1, HMAC de cuerpo crudo, mensaje cifrado, conversación
  conocida/seudónima, retención marcada, evento inmutable, outbox, auditoría, métrica y controles.
- Dedupe por evento y mensaje externo, colisiones, carrera, identidad desconocida, tenant, firma
  inválida, kill switch y ausencia de PII en evidencias quedaron probados.
- La identidad seudónima usa el keyring versionado y conserva continuidad durante rotaciones si las
  versiones históricas permanecen disponibles.
- Evidencia final: `pnpm validate` con 69 unitarias/100 % crítico, 17 WhatsApp, 14 de migración sin
  drift, integración y todas las regresiones, observabilidad e infraestructura verdes.
- Se corrigió el fixture Wompi vencido sustituyendo su fecha fija por 2099; no cambió lógica real.
- Las migraciones 24/25/26 quedaron aplicadas y `database:status` confirmó 26/26.
- `pnpm audit --prod` sigue bloqueado por HTTP 410; la purga de contenido vencido queda TD-023 y
  bloquea tráfico real junto con credenciales/contrato Meta.
- Commit lógico: `feat: add simulated WhatsApp inbound messages`; PR borrador #1.
- Siguiente vertical: E3-H6A, bandeja de conversaciones WhatsApp exclusivamente simulada.

## 2026-07-17 — sesión actual: E3-H6A

- E3-H5A se publicó primero en `d57ac6d` y el PR borrador #1 quedó actualizado.
- Objetivo: bandeja simulada de conversaciones con listado/timeline, sin respuesta ni asignación.
- Se agregaron permiso `whatsapp-conversations.read`, rutas keyset, filtros, descifrado autorizado,
  bloqueo por retención, auditoría, métrica y controles independientes.
- Owner/admin/operations/support acceden; read-only/finance/logistics permanecen default-deny.
- Paginación, cursor inválido, contenido inbound/outbound, historial, vencimiento, tenant ajeno y kill
  switch están cubiertos en `pnpm whatsapp:verify` 21/21.
- El primer gate encontró Docker/PostgreSQL apagado; se levantó preservando volúmenes y pasó al repetir.
- No hay migraciones nuevas; `database:verify` sigue 14/14 sobre 26 migraciones sin drift.
- `pnpm validate`, regresiones, observabilidad e infraestructura quedaron verdes; audit volvió a
  responder y reportó cero vulnerabilidades conocidas.
- Siguiente vertical: E3-H7A, asignación de conversaciones exclusivamente simulada.

## 2026-07-17 — sesión actual: E3-H7A

- La skill `token-optimizer` se ejecutó primero en modo read-only: salud 63/100, overhead de arranque
  17.854 tokens (6,9 %) y sin subagentes filtrados, metas activas ni memoria desperdiciada. No se
  cambiaron hooks, status line ni configuración global de Codex.
- Objetivo: asignación de conversaciones exclusivamente simulada, sin respuestas ni tráfico Meta.
- La migración 27 agrega assignment actual versionado e historial inmutable tenant-safe con FKs,
  constraints, índices y trigger append-only.
- Support reclama para sí; owner/admin/operations pueden reassign/unassign. Membresía/usuario
  activos, rol elegible, tenant, expected version, lock serializable e idempotencia fallan cerrados.
- Carrera, replay, colisión, agente ajeno/inactivo/no elegible, RBAC, tenant y kill switch están
  probados; bandeja, outbox, auditoría y métricas omiten email, teléfono, contenido e IDs externos.
- Incidencias corregidas antes del cierre: `CHECK` SQL con razón `NULL` y nombre de FK distinto al
  esperado por Prisma. La base persistente quedó actualizada sin borrar volúmenes.
- Evidencia final: `pnpm validate` 69/69 y cobertura crítica 100 %; WhatsApp 25/25; migraciones
  15/15 y 27/27; 14 gates funcionales, observabilidad, infraestructura y auditoría en verde.
- Riesgo abierto: revocar una membresía no libera su conversación automáticamente (R-061/TD-024).
- Siguiente vertical: E0-H3B, OpenTelemetry local verificable, alertas conectadas y acceso seguro a
  `/metrics`, sin despliegue productivo.

## 2026-07-17 — sesión actual: E0-H3B

- La skill `token-optimizer` se ejecutó primero en modo read-only: salud 63/100, overhead de arranque
  17.854 tokens (6,9 %), sin lecturas obsoletas, bloat, duplicados, subagentes, metas o memoria
  desperdiciada. No se cambió configuración global de Codex.
- Objetivo: conectar observabilidad local verificable sin desplegar producción ni añadir proveedores.
- Se agregaron trazas W3C manuales de baja cardinalidad, SDK/exportador OTLP, Collector 0.156.0,
  correlación trace/span con Pino y flags/kill switch/timeouts fail-open para telemetría.
- `/metrics` usa loopback por defecto, modo disabled o Bearer técnico con comparación de hash constante;
  producción exige Bearer y token mínimo de 32 caracteres.
- Readiness genera alertas solo en transiciones; Alertmanager 0.32.1 agrupa/deduplica y entrega a un
  receptor local que conserva únicamente estado/timestamp. Fallas de alerta no cambian readiness.
- El compose local pasó de tres a seis servicios; puertos y recursos siguen limitados a localhost y el
  Collector debug/receptor se documentan exclusivamente como herramientas de desarrollo.
- El gate runtime probó traceparent conocido, redacción, Bearer, alerta firing/resolved única, caída de
  Redis y continuidad/recuperación al detener Collector.
- Incidencias corregidas: dos errores de tipos iniciales, cobertura branch 87,5 % en URLs seguras y
  formato Markdown del primer cierre. Todos quedaron corregidos antes de la regresión final.
- Evidencia: `pnpm validate` 73/73 y 100 % crítico; 14 gates funcionales; infraestructura,
  observabilidad, 27/27 migraciones y auditoría de dependencias verdes.
- No hubo migraciones nuevas, credenciales cloud, despliegue ni tráfico de proveedor. El estado de
  transición de alertas en memoria queda TD-025 y el backend persistente de traces TD-026.
- Siguiente vertical: E6-H1A, cola operativa unificada de solo lectura, tenant-safe y sin mutaciones.

## 2026-07-17 — sesión actual: E6-H1A

- La skill `token-optimizer` se ejecutó en modo read-only: salud 63/100, overhead de arranque 17.854
  tokens (6,9 %) y sin subagentes, metas, lecturas obsoletas, bloat, duplicados o memoria desperdiciada.
  No se modificaron hooks, status line ni configuración global de Codex.
- Objetivo: cola operativa unificada de solo lectura sobre hechos existentes, sin UI ni mutaciones.
- Se agregó permiso `operations.queue.read` solo para owner/admin/operations, query estricta,
  `no-store`, flag/kill switch, auditoría y métrica acotada.
- Una sola consulta `UNION ALL` limita organización en cada rama y proyecta pedidos, incidencias
  Shopify/Wompi, intenciones de pago y conversaciones sin PII, payloads ni IDs externos.
- Atención v1 deriva de estados durables; el cursor usa timestamp inmutable más `tipo:UUID`. La
  migración 28 añade cinco índices tenant+timestamp+UUID y quedó aplicada 28/28 sin borrar volúmenes.
- `operations:verify` pasó 5/5; `database:verify` 15/15; `validate` 73/73 con 100 % crítico; todos los
  gates funcionales, infraestructura, observabilidad y auditoría de dependencias quedaron verdes.
- Incidencias corregidas: fixture de identidad WhatsApp incompatible con su constraint; colisión
  `ENOTEMPTY` al paralelizar generadores Prisma, resuelta ejecutando los gates oficiales en serie.
- Se documentaron arquitectura, contrato, seguridad, pruebas y runbook. No se publicaron cambios ni
  se conectaron proveedores reales.
- Riesgo abierto: el siguiente resumen no debe duplicar/divergir de la atención v1 (R-067).
- Siguiente vertical: E6-H2A, resumen operativo agregado de solo lectura y ventana acotada.

## 2026-07-17 — sesión actual: publicación y E6-H2A

- Se revisaron 71 archivos, diff staged y patrones de secretos; el bloque E3-H7A/E0-H3B/E6-H1A se
  publicó en `d1755f1` a `origin/codex/foundations-e0-h2` y se actualizó el PR borrador #1.
- El conector GitHub no pudo editar el PR por permiso 403; `gh` autenticado por keyring fue el
  fallback previsto por la skill, sin exponer tokens.
- `token-optimizer` reportó salud 63/100, overhead 17.854 tokens (6,9 %), eficiencia de sesión S/96,
  cero desperdicio medible, subagentes o metas. No se instalaron hooks/compact globales sin permiso.
- E6-H2A centraliza tipos, estados y atención v1 en `operational-read-model.ts`; cola y resumen no
  pueden mantener semánticas separadas.
- `GET /operations/organizations/:organizationId/queue/summary` exige `[from,to)` <=31 días y agrega
  totales/atención por tipo y estado con una sola consulta `GROUPING SETS`, sin IDs ni PII.
- Se reutilizan permiso y controles E6-H1A por ser una proyección menos granular; auditoría/métrica
  son acotadas y el kill switch falla cerrado.
- Evidencia final: operations 7/7, database 15/15 y 28/28, validate 73/73 con 100 % crítico, todas las
  regresiones, infraestructura, observabilidad y auditoría de dependencias verdes.
- El primer validate final solo detectó formato en dos Markdown nuevos; Prettier lo corrigió.
- No hubo migración, mutaciones operativas, credenciales, tráfico real ni despliegue.
- Siguiente vertical: E6-H3A, base segura del dashboard web sin Bearer en localStorage.
