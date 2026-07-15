# Registro cronológico de sesiones

Actualizado: 2026-07-14

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
