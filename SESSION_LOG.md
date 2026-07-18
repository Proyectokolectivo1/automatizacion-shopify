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

## 2026-07-17 — sesión actual: E6-H3A dashboard web seguro

- `token-optimizer` se ejecutó en modo Codex read-only: overhead 17.854 (6,9 %), eficiencia S/96 y
  cero desperdicio medible; no se instalaron hooks/configuración global.
- NestJS añade opciones de login tras verificar contraseña, listado propio de membresías y switch de
  organización que revoca/crea sesión de forma atómica.
- Next.js actúa como BFF con cookies access/refresh HttpOnly, SameSite, Secure en producción, CSRF
  CSPRNG, Origin exacto, timeout interno y errores acotados.
- El dashboard responsive deriva tenant de `/auth/me`, consume cola/resumen, filtra rango/tipo,
  pagina por cursor opaco y elimina email/IDs/relaciones antes del navegador.
- La revisión real de escritorio/móvil detectó CSP incompatible con React Refresh; `unsafe-eval`
  quedó limitado a desarrollo y el build productivo se comprobó sin esa directiva.
- Evidencia final: validate 81/81, API 73/73 con 100 % crítico, web 8/8, auth 16/16, operations 7/7,
  database 15/15 y 28/28; todos los gates, infraestructura, observabilidad y audit verdes.
- No hubo migración, mutaciones operativas, credenciales, tráfico real ni despliegue. Los cambios
  E6-H3A quedan locales y no se publican sin una petición explícita.
- Siguiente vertical: E6-H4A, alertas operativas internas, durables y deduplicadas.

## 2026-07-18 — sesión actual: E6-H4A alertas operativas durables

- `token-optimizer` se ejecutó en modo Codex read-only: overhead 17.854 tokens (6,9 %), eficiencia
  histórica S/96, cero desperdicio medible; no se instalaron hooks/configuración global.
- Cinco reglas inmutables v1 consumen la política `requires_attention` compartida; no se introdujeron
  SLA, severidad, prioridad ni semánticas paralelas.
- Migraciones 29/30 añaden `operational_alerts`, constraints de lifecycle/tenant, dedupe parcial e
  índices alineados con Prisma; la base persistente quedó 30/30 y sin drift.
- Scheduler/evaluador recorren lotes acotados, adquieren locks tenant ordenados y ejecutan una lectura
  agregada más una transición SQL; replay, carrera, resolución y reapertura son idempotentes.
- `GET /operations/organizations/:organizationId/alerts[/rules]` es solo lectura para
  owner/admin/operations, usa cursor/filtros/no-store y no expone PII, IDs fuente ni payloads.
- Evidencia final: validate 81/81, API 73/73 con 100 % crítico, web 8/8, alerts 7/7, database 16/16,
  auth 16/16, operations 7/7; todos los gates funcionales/runtime y audit de dependencias verdes.
- Incidencias corregidas: casts SQL del CTE, snapshot previo al lock, dirección de índices y tipado
  estricto de cuerpos Supertest. No quedan defectos conocidos en E6-H4A.
- No hubo credenciales, tráfico real, notificaciones, autocorrecciones, exportaciones, despliegue,
  commit ni push. E6-H3A/E6-H4A permanecen locales hasta autorización explícita.
- Siguiente vertical propuesta: E6-H5A, búsqueda operativa global de solo lectura.

## 2026-07-18 — sesión actual: E6-H5A búsqueda operativa global

- `token-optimizer` se ejecutó en modo Codex read-only: overhead 17.855 tokens (6,9 %), eficiencia
  S/96 y cero desperdicio medible; no se instalaron hooks ni configuración global.
- Se añadió búsqueda sobre el read model compartido limitada a ID interno exacto, tipo, estado y
  motivo operativo; exige ventana `[from,to)` máxima de 31 días y límite máximo 50.
- Ranking determinista y cursor con huella de consulta/filtros evitan paginación cruzada; RBAC,
  organización en SQL, auditoría sin `q`, métrica acotada y kill switch independiente fallan cerrados.
- El BFF deriva el tenant, valida upstream y elimina `itemId`/`matchKind`; el dashboard incorpora
  término opcional sin exponer PII, tokens, IDs de tienda o relaciones.
- Evidencia final: `pnpm validate` 82/82 (API 73/73, web 9/9, cobertura crítica 100 %),
  `pnpm operations:verify` 9/9 y `pnpm web:verify` 9/9.
- El primer cierre detectó únicamente `no-control-regex`; la validación se reescribió con code points
  y el gate completo pasó. No hubo migración, credenciales, tráfico real, mutaciones ni despliegue.
- El repositorio ya estaba publicado hasta E6-H4A en `3ed4dfc`; E6-H5A queda local hasta autorización.
- Siguiente vertical propuesta: E6-H6A, detalle operativo mínimo de solo lectura; exports quedan E6-H7.

## 2026-07-18 — sesión actual: E6-H6A detalle operativo mínimo

- Se registró alcance/riesgos antes de editar y se construyó API tenant-safe para los cinco tipos con
  allowlists, timeline máximo 25, RBAC específico, 404 uniforme, auditoría, métrica y kill switch.
- El BFF cifra referencias con AES-256-GCM/AAD por 15 minutos y valida expiración/tenant; producción
  exige `WEB_DETAIL_REFERENCE_KEY`. UUID, referencia y tenant no vuelven al navegador.
- Dashboard añade “Ver detalle”, estados loading/error/close, campos por tipo y timeline accesible sin
  mutaciones, cuerpos, PII, metadata libre, actores ni referencias externas.
- Docker Desktop estaba detenido; se levantó para las pruebas. El teardown ahora tolera setup fallido.
  Una expectativa concurrente se corrigió para usar timeline observable en vez de orden incidental.
- Evidencia final: `pnpm validate` 84/84 (API 73/73 al 100 %, web 11/11),
  `pnpm operations:verify` 11/11 y `pnpm database:verify` 16/16, 30/30 sin drift.
- No hubo migración, credenciales externas, tráfico real, mutaciones operativas, despliegue, commit ni
  push. Siguiente vertical: E6-H7A, export CSV operativo acotado y redactado.

## 2026-07-18 — sesión actual: E6-H7A export operativo seguro

- Se fijó antes de editar CSV de cinco columnas, ventana máxima 7 días, límite 1.000, owner/admin,
  rate limit durable, auditoría y generación sin persistencia.
- API devuelve JSON redactado/ordenado con `truncated`; BFF valida y genera BOM UTF-8, CRLF y comillas
  RFC 4180. Fórmulas tras espacios, tab o retorno quedan neutralizadas.
- Dashboard ofrece export del rango solo para owner/admin, lo deshabilita con búsqueda activa o rango
  mayor de 7 días e informa conteo/truncado. No usa disco, MinIO, DB, jobs ni proveedores.
- Evidencia focalizada: `operations:verify` 12/12, `web:verify` 13/13, `database:verify` 16/16 e
  `infra:verify` verde. El primer validate encontró solo tres Markdown sin Prettier y se corrigieron.
- Sin migración, PII, tráfico externo, despliegue, commit ni push. Fase E6-H1A..H7A completa localmente.
- Siguiente vertical no bloqueada: E9-H1A backup/restore PostgreSQL local reproducible; objetivos
  contractuales y almacenamiento externo permanecen bloqueados por decisión/proveedor.

## 2026-07-18 — sesión actual: E9-H1A backup/restore PostgreSQL local

- Se registró alcance antes de editar y se añadió `backup:verify` con `pg_dump` custom de PostgreSQL
  17, archivo temporal `0600` ignorado y restore transaccional en una base aleatoria aislada.
- La comparación cubre conteos exactos de 39 tablas, historial/estado de migraciones, constraints,
  índices y secuencias. Los 31 registros históricos incluyen una migración revertida; 30 están vigentes.
- Base y dump temporales se eliminan en `finally` y su ausencia se comprueba antes del éxito. El JSON
  local persistente solo contiene conteos/tamaños/tiempos y queda fuera de Git.
- Segunda medición: backup 360 ms, restore 890 ms, verificación 323 ms, total 3.523 ms.
- Evidencia: `database:verify` 16/16 y `pnpm validate` 86/86, lint/tipos/builds verdes. CI incorpora el
  gate después de migraciones. No se afirmó backup offsite ni RPO/RTO.
- Siguiente vertical no bloqueada: E9-H2A carga local, ráfagas, acumulación y recuperación.

## 2026-07-18 — sesión actual: E9-H2A carga local y recuperación

- Se registraron dataset/umbrales antes de editar y se añadió un rango reservado de 500 fixtures,
  suite aislada, comando `load:verify`, reporte agregado, CI y runbooks.
- El gate envía 500 webhooks HTTP/HMAC con concurrencia 25, demuestra backlog de 500, recupera con
  cuatro publicadores/worker 50 y repite 50 entregas sin duplicar.
- La primera corrida agotó 120 s en 230 pedidos. La topología concurrente expuso 103 DLQ por `P2034`;
  una corrida de 100 confirmó conflictos en sync y clasificación.
- Ambos servicios ya tenían advisory lock por pedido; se sustituyó `SERIALIZABLE` por `READ COMMITTED`
  y se conservaron atomicidad, locks y cinco reintentos exponenciales. Gates dedicados pasaron.
- Evidencia final: ingreso 140,36 req/s/p95 251 ms; drain 7.843 ms/63,75 pedidos/s; 500 pedidos,
  1.500 transiciones, 50 replays, cero errores/DLQ y cleanup de base/colas.
- Regresión: outbox 4/4, webhook 5/5, sync 4/4, clasificación 4/4, database 16/16, carga 1/1 y
  `pnpm validate` 87/87 con ambos builds. No se afirmó capacidad productiva.
- Siguiente vertical no bloqueada: E9-H3A auditoría local automatizada de seguridad y supply chain.

## 2026-07-18 — sesión actual: E9-H3A baseline local de seguridad

- Se registró alcance antes de editar y se implementó `security:verify` fail-closed con reporte
  agregado ignorado; CI lo ejecuta antes de generar el entorno local.
- Siete patrones high-confidence se auto-prueban en memoria y auditan 443 archivos candidatos sin
  imprimir valores. Cero secretos o artefactos prohibidos; `.env`/`.artifacts` siguen ignorados.
- Tres manifests usan versiones exactas y ningún lifecycle script; frozen lockfile, permisos CI,
  cuatro imágenes/bindings Compose, secretos obligatorios y headers/CSP pasan.
- `pnpm audit --prod` revisó 402 dependencias y devolvió cero vulnerabilidades conocidas; checkout CI
  ahora usa `persist-credentials: false`.
- Evidencia: `security:verify`, web 13/13 y `pnpm validate` 87/87 verdes. Tags SHA, CSP inline,
  SAST/DAST/pentest/TLS/secret manager/infra objetivo quedan abiertos y explícitos.
- Siguiente vertical no bloqueada: E9-H4A smoke productivo local y rollback forward-compatible.

## 2026-07-18 — sesión actual: E9-H4A smoke local de release

- Se registró alcance antes de editar y se añadió `release:smoke` al root y CI.
- El gate construye API/web, aplica migraciones dos veces, verifica 30/30 y arranca ambos artefactos
  productivos directamente sobre puertos efímeros.
- API pasó liveness/readiness y métricas 401/200; web pasó homepage, CSP sin `unsafe-eval`, cabeceras,
  ausencia de `X-Powered-By` y BFF 401/`no-store`.
- El primer intento reveló un `cwd` incorrecto para Next; se fijó `apps/web` y la repetición pasó.
- Medición inicial verde: API 3.038 ms/web 1.048 ms. El cierre con 32 migraciones repitió verde en
  3.278 ms/1.012 ms. SIGTERM cerró ambos listeners.
- El reporte agregado está ignorado/redactado. Se documentó rollback expand/contract sin `down` y
  restore únicamente para incidentes de datos autorizados.
- No hubo despliegue, rollback real, TLS/proxy, commit ni push.
- Siguiente vertical no bloqueada: E9-H5A drill local de observabilidad y recuperación con objetivos
  medidos; backend/routing/SLO productivos continúan sujetos a infraestructura y decisión humana.

## 2026-07-18 — sesión actual: E9-H5A, E3-H8A y E0-H4D

- `observability:verify` ahora construye/inicia autónomamente, usa secretos/puerto efímeros, mide
  presupuestos 15 s/30 s, restaura servicios y escribe reporte redactado.
- Resultados: Redis down/readiness 697 ms, firing 978 ms, readiness up 6.322 ms, resolved 6.325 ms,
  Collector 4.185 ms; API viva, lifecycle exacto y sin fugas.
- Se priorizó TD-023/R-055: migración 31, scheduler fail-closed, lote/lock/`SKIP LOCKED`, trigger
  irreversible y auditoría atómica purgan solo ciphertext/fingerprint vencidos.
- `whatsapp:verify` pasó 26/26: vigente rechazado, vencido purgado, evidencia conservada, replay no-op,
  timeline/métrica seguros. Política legal y Meta real siguen bloqueados.
- Preflight TD-010 confirmó cero nulos/huérfanos; migración 32 validó seis constraints legacy.
- Cierre: database 16/16/32 migraciones, security 458 archivos/402 deps, backup 39 tablas/32
  migraciones, release smoke API 3.278 ms/web 1.012 ms y validate 87/87 con ambos builds.
- No hubo tráfico real, despliegue, commit ni push.
- Siguiente vertical local: E0-H5D, liberar asignaciones WhatsApp al revocar membresía.

## 2026-07-18 — Shopify E1-H1B..H5B al 100 % local

- Se fijó Admin GraphQL API 2026-07 con router simulation/live, timeout, tres intentos, backoff,
  errores redactados y probe efectivo de pedidos, inventario y ubicaciones.
- Pedidos por GID y listados por `updated_at` usan cursor; line items drenan páginas de 250 y fallan al
  superar 500 en vez de truncar. Pedidos guest sin customer/address quedan soportados.
- Activación live asegura `ORDERS_CREATE` consulta-before-create sobre callback HTTPS. El secreto HMAC
  rota como activo+anterior cifrados con deadline 24 h y el ingreso distingue fixture/live.
- El outbox consume `MARK` idempotente y `CANCEL` asíncrono sin refund; CANCEL requiere actions enabled,
  kill switch abierto y flag destructivo explícito. Replay reconoce cancelación ya aplicada.
- Scheduler multi-tienda retoma ventana/cursor, pagina hasta fin o safety limit y conserva endpoint
  manual/RBAC.
- Cinco gates Shopify verdes. `pnpm validate`: 99/99 (API 86, web 13), cobertura crítica 100 %, lint,
  tipos y builds. Outbox 4/4; seguridad 474 archivos/402 deps; DB 32 migraciones actualizadas.
- Arquitectura, seguridad, runbook, testing y registros maestros actualizados. No hubo credenciales,
  Shopify real, despliegue, commit ni push.
- Implementación E1 local: 100 %. Validación end-to-end en tienda development:
  `BLOQUEADO_POR_CREDENCIALES`.

## 2026-07-18 — E0-H5D, E0-H3C y E1-H5C

- La revocación de membresías ahora comparte lock por organización con asignación WhatsApp y libera
  todas las conversaciones dentro de la misma transacción que revoca membresía/sesiones.
- Cada liberación incrementa versión y crea historial `UNASSIGN/MEMBERSHIP_REVOKED`, outbox y auditoría
  agregada. Replay, carrera con claim, reparación legacy y tenant ajeno quedaron probados.
- La migración 33 amplió el enum/constraint de razón sin relajar la forma válida de asignar/desasignar.
- Alerting hidrata una sola vez desde Alertmanager v2 antes del baseline: adopta firing propio, evita
  duplicarlo tras reinicio y emite resolved al recuperarse; contratos inválidos fallan cerrados.
- El drill reinició API con Redis caído: down 692 ms, firing 972 ms, readiness up 6.265 ms, resolved
  6.534 ms y Collector 3.693 ms, conservando exactamente un firing.
- La inspección de incidencias Shopify añadió cursor keyset opaco ligado al filtro, `limit + 1` y
  rechazo de cursor alterado/cross-filter; una inserción concurrente no duplica páginas existentes.
- Evidencia: validate 105/105 (API 92/web 13), identity 5/5, WhatsApp 26/26, reconciliación 6/6,
  database 16/16/33 migraciones, seguridad 478 archivos/402 deps, backup y release smoke verdes.
- TD-016/024/025 y R-061/R-064 quedaron cerrados o mitigados. No hubo proveedor real, despliegue,
  commit ni push. Siguiente vertical local propuesta: E0-H6A, fronteras modulares mínimas (TD-003).

## 2026-07-18 — E0-H6A y E7-H1A

- `architecture:verify` inspecciona 123 fuentes/529 imports y forma parte de `validate`/CI. Separa
  composición, plataforma y diez dominios; cinco colaboraciones exactas deben seguir ejercidas.
- Ocho fixtures demuestran permisos y rechazos. Módulo desconocido, escape de `src`, plataforma→dominio,
  par no allowlisted o excepción obsoleta fallan cerrados, sin dependencias nuevas.
- `DependencyStatus` pasó a foundation y eliminó el ciclo de tipos observability→health. TD-003 y R-084
  quedaron resueltos/mitigados.
- Se completó la base E7-H1A ya iniciada: cartera Wompi/COP simulada por estado, una consulta agregada,
  ventana 31 días, RBAC owner/admin/finance, tenant, no-store, auditoría, métrica y controles.
- BIGINT monetario ahora sale como decimal string. `finance:verify` 4/4 cubre un importe >MAX_SAFE,
  vacío, límites, RBAC/tenant, metadata sin importes y kill switch.
- Cierre: validate 105/105 y builds verdes; arquitectura verde; seguridad 486 archivos/402 deps;
  release smoke API 2.065 ms/web 910 ms y shutdown limpio.
- Costos, recaudo y rentabilidad siguen bloqueados por decisión/datos externos. No hubo proveedor real,
  despliegue, commit ni push. Próximo hardening propuesto: E0-H6B sobre TD-021.
