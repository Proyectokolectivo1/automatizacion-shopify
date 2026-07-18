# Resumen general del proyecto

Actualizado: 2026-07-17

> Este documento debe actualizarse en cada sesión donde cambien funcionalidades, alcance, bloqueos,
> riesgos, pruebas o el siguiente paso del proyecto.

## ¿De qué trata el proyecto?

Ecommerce Inteligente es una plataforma interna para centralizar y automatizar la operación de una o
varias tiendas Shopify. Su objetivo es reducir trabajo manual, errores y pérdida de trazabilidad desde
que entra un pedido hasta que se paga, se envía, se imprime su documentación y se analiza su
rentabilidad.

La solución proyectada conectará:

- Shopify para tiendas, pedidos, clientes, inventario y webhooks.
- Wompi para links de pago y confirmaciones de transacciones.
- WhatsApp Cloud API para mensajes operativos y conversaciones con clientes.
- Mastershop para guías, logística y tracking.
- Impresoras Windows para documentos y etiquetas.
- Fuentes publicitarias para atribución, costos y ROAS.

La plataforma incluirá una API NestJS, una aplicación web Next.js, PostgreSQL, Redis, almacenamiento
S3-compatible, workers asíncronos, auditoría, métricas y herramientas operativas.

## Estado actual

Estado global: `EN_DESARROLLO`. No está listo para piloto ni producción.

El repositorio canónico público es
<https://github.com/Proyectokolectivo1/automatizacion-shopify>, rama `main`. La base anterior está
publicada; la rama `codex/foundations-e0-h2` contiene el avance validado y el PR borrador #1 está
abierto. GitHub CLI 2.96.0 usa la cuenta segura del keyring; no se utiliza el PAT expuesto.

Las fundaciones están al 100 %, Shopify al 75 %, pagos/tarifas al 80 %, WhatsApp al 90 % y operación
al 15 %. Ya existe un monorepo reproducible
con CI, entorno local, observabilidad, persistencia transaccional, entrega asíncrona y registro
Shopify simulado. Los webhooks firmados ya producen pedidos normalizados durables en simulación;
los pedidos se clasifican y concilian en simulación. La configuración WhatsApp simulada ya tiene
ciclo operativo seguro, catálogo local versionado, envío transaccional durable, estados monotónicos
y mensajes entrantes cifrados por webhooks sintéticos autenticados. La bandeja simulada ya ofrece
listado/timeline y asignación versionada tenant-safe; todavía no existen conexiones, entregas ni
estados Meta reales. La primera cola operativa unificada ya proyecta los cinco dominios con RBAC,
filtros, cursor estable y mínima exposición de datos.

## Implementado

- Monorepo pnpm/Turborepo con TypeScript strict, ESLint, Prettier y versiones fijadas.
- Aplicación web Next.js y API NestJS compilables.
- CI con formatter, lint, typecheck, pruebas, build y verificaciones de infraestructura.
- PostgreSQL, Redis y MinIO locales autenticados, persistentes y limitados a localhost.
- Logs JSON redactados, correlation ID, trazas W3C/OTLP y métricas Prometheus protegidas.
- Liveness y readiness reales para PostgreSQL, Redis y MinIO.
- Collector, Alertmanager y receptor local reproducibles, con fallo/recuperación y dedupe probados.
- Pruebas de degradación y recuperación cuando Redis o el Collector se detienen.
- Prisma 7.8.0 y migración inicial expand-only.
- Tablas `organizations`, `stores`, `idempotency_keys` y `outbox_events`.
- Lifecycle Prisma único en NestJS y health check reutilizando ese cliente.
- Transacción serializable de demostración con snapshot idempotente y evento outbox atómico.
- Publisher BullMQ con claim concurrente, lease recuperable, backoff y deduplicación por evento.
- Worker separado, ejecución durable, reintentos y DLQ; simulación y kill switch seguros.
- Pruebas PostgreSQL/Redis de duplicado, respuesta perdida, rollback, carrera y recuperación.
- Identidad local con Argon2id, sesiones opacas revocables y refresh rotativo con detección de replay.
- RBAC default-deny aplicado en backend, aislamiento por organización y auditoría de acceso.
- Rate limit y bloqueo temporal durables; adaptador de correo simulado con flag y kill switch.
- Invitaciones y recuperación con tokens CSPRNG de un uso, expiración, revocación y consumo atómico.
- Creación/vinculación de membresías sin escalamiento y reset Argon2id que revoca todas las sesiones.
- Constraints para ownership, dominio Shopify, moneda, idempotencia y consistencia del outbox.
- Migración probada desde una base vacía, reaplicada como no-op y verificada sin drift.
- Ownership organizacional explícito de outbox/jobs, con backfill expand-only y entrega versionada.
- API owner/admin para inspeccionar DLQ paginada y reprocesar un evento con idempotencia, auditoría,
  aislamiento de tenant, métricas, flag y kill switch cerrados por defecto.
- Bootstrap local, concurrente y fail-closed del primer owner, sin argumentos ni secretos persistidos.
- API owner/admin para listar membresías, cambiar roles y revocar acceso con locks, idempotencia,
  protección del último owner e invalidación transaccional de sesiones.
- Registro owner/admin de tiendas Shopify con dominio canónico, tenant isolation y snapshot idempotente.
- Token Shopify cifrado con AES-256-GCM, AAD tenant+tienda, keyring versionado y rotación comprobada.
- Mock contractual v1 para probar, activar y desactivar, marcado siempre como simulación y cerrado por flags.
- Ingreso `orders/create` sobre cuerpo crudo con HMAC-SHA256 constante antes de parsear JSON.
- Secreto webhook AES-256-GCM separado del token, allowlist, límite de 256 KiB y errores seguros.
- Evento webhook tenant-safe e idempotente con detección de colisión, outbox atómico y worker BullMQ.
- Replay, concurrencia y caída/recuperación de Redis probados con fixture sintético versionado.
- Consulta de pedido desacoplada mediante `ShopifyProvider` y normalizador Zod v1.
- Clientes, direcciones, pedidos e items tenant-safe con IDs externos estables y constraints SQL.
- Montos en unidades menores, snapshots monotónicos y evento outbox transaccional de sincronización.
- Contrato inválido, recurso inexistente, replay, carrera, actualización, tardíos y DLQ probados.
- Políticas de clasificación v1 versionadas por tienda con prioridad explícita y evidencia sintética.
- Máquina default-deny con historial inmutable, prepago/COD, outbox, auditoría, métricas y replay.
- Pipeline webhook/outbox/Redis/sync/clasificación probado tras caída y recuperación de Redis.
- Checkpoint de conciliación por tienda y detección deduplicada de faltantes, fallidos y atascados.
- Reproceso individual tenant-safe mediante outbox con RBAC, idempotencia, auditoría y métricas.
- Políticas de tarifa COD globales/por tienda, versionadas, activables y resueltas de forma determinista.
- Preview/resolución con RBAC, tenant, idempotencia, auditoría, métricas, decisión durable y outbox.
- `WompiProvider` simulado y una intención COD durable con referencia, monto, expiración y firma SHA-256.
- Checkout contractual sobre `.invalid`, RBAC, tenant, replay, auditoría, métricas y outbox.
- Webhook authoritative, dos recordatorios durables a +8/+16 y vencimiento/abandono a 24 horas.
- Política histórica `MARK`/`CANCEL`, locks contra aprobación simultánea y revisión de pagos tardíos.
- Conciliación diaria Wompi con checkpoint, reporte e incidencias deduplicadas, sin autocorrecciones.
- `WhatsAppProvider` simulado con fixture v1 y configuración por tienda tenant-safe.
- Token WhatsApp cifrado/versionado, prueba, activación, desactivación, rotación, outbox y auditoría.
- `phoneNumberId` único entre tenants, flags cerrados, modo simulación y kill switch probados.
- Catálogo WhatsApp local con versiones inmutables, variables validadas y revisión simulada explícita.
- Activación única por tienda/evento/idioma, RBAC, tenant, replay, carrera, outbox y métricas probados.
- Mensaje transaccional WhatsApp simulado con render tipado, consentimiento, E.164 y dedupe de negocio.
- Conversación durable, estado `simulated_accepted`, outbox/auditoría sin PII y kill switch probados.
- Webhook de estados WhatsApp sintético v1 con HMAC sobre cuerpo crudo y secreto cifrado separado.
- Estados monotónicos `simulated_*`, terminales inmutables, replay, carrera e historial probados.
- Webhook inbound sintético v1, mensaje cifrado, conversación conocida/seudónima y retención marcada.
- Dedupe por evento/mensaje, identidad tenant-safe, redacción, inmutabilidad y outbox inbound probados.
- Bandeja WhatsApp simulada con cursores estables, filtros, timeline e historial tenant-safe.
- Descifrado solo con RBAC y retención vigente; listado, auditoría y métricas sin PII.
- Claim propio y reassign/unassign manager-only con membresías elegibles, versión y lock de carrera.
- Asignación actual, historial inmutable, idempotencia, outbox, auditoría y métricas sin PII probados.
- Cola operativa unificada de solo lectura con cinco tipos, atención v1, filtros, cursor keyset,
  índices tenant-safe, auditoría, métricas y controles fail-closed.
- Documentación de arquitectura, contratos, seguridad, pruebas y runbooks iniciales.

## Qué falta por implementar

### Fundaciones pendientes

- Persistencia/consulta productiva de trazas, routing de alertas y SLO se completarán en hardening.
- Backups/restore, carga, TLS, secret manager y despliegue siguen pendientes antes de piloto.

### Shopify

- Conexión real y registro remoto de tiendas; la gestión simulada ya está implementada.
- Registro remoto del webhook y rotación solapada de secretos; el ingreso simulado ya está implementado.
- Conexión real para pedidos e inventario; la sincronización normalizada simulada ya está completa.
- Scheduler de conciliación, paginación operativa y estados posteriores; el reproceso simulado ya existe.
- Mock, fixtures, contrato, feature flag y kill switch mientras falten credenciales.

### Pagos y WhatsApp

- WhatsApp Cloud API real y registro/revisión remota de plantillas.
- Mocks, fixtures y pruebas contractuales por vertical mientras falten credenciales.

### Logística e impresión

- Adaptador Mastershop, mock contractual, creación de guías y tracking.
- Agente de impresión Windows, descubrimiento de impresoras y spool seguro.
- Generación de PDF/etiquetas, reimpresión auditada y matriz de compatibilidad.

### Operación, finanzas y publicidad

- Resumen agregado y dashboard visual sobre la cola ya disponible; faltan alertas, búsquedas y
  exportaciones.
- Costos históricos, rentabilidad por pedido y snapshots financieros.
- Integraciones publicitarias, atribución con nivel de confianza y ROAS.
- Auditoría funcional y herramientas de reproceso manual.

### Preparación para producción

- Proveedor S3-compatible apto para producción.
- Backups externos y restauración probada con RPO/RTO aprobados.
- Seguridad, carga, caos, observabilidad completa y runbooks operativos.
- Piloto controlado, criterios de aceptación y aprobación humana de release.
- Infraestructura y despliegue productivo; actualmente no autorizados.

## Bloqueos externos

- `BLOQUEADO_POR_SEGURIDAD`: revocar el PAT compartido en la conversación; no se usó ni versionó.
- `BLOQUEADO_POR_CREDENCIALES`: Shopify development, Wompi sandbox y Meta/WhatsApp.
- `BLOQUEADO_POR_PROVEEDOR`: contrato, autenticación, payloads y sandbox de Mastershop.
- `BLOQUEADO_POR_INVENTARIO`: modelos, drivers y papel de las impresoras Windows.
- `BLOQUEADO_POR_DECISION`: dominio/correo, políticas COD, retención legal, atribución y RPO/RTO.

Mientras continúen estos bloqueos se deben implementar adaptadores, mocks, fixtures, pruebas de
contrato, feature flags, modo simulación y kill switches; no se deben presentar como integraciones
reales terminadas.

## Siguiente vertical

E6-H2A: construir un resumen operativo agregado de solo lectura, tenant-safe y con RBAC sobre la
misma política v1 de la cola. Debe usar una ventana temporal acotada, conteos deterministas y mínima
proyección, sin crear todavía UI completa, alertas automáticas ni mutaciones.

## Dónde consultar más detalle

- `PROJECT_STATUS.md`: estado técnico y evidencia actual.
- `IMPLEMENTATION_PLAN.md`: fases y criterios de salida.
- `BACKLOG.md`: trabajo priorizado y bloqueos.
- `TEST_REPORT.md`: comandos, resultados e incidencias corregidas.
- `RISKS.md` y `TECHNICAL_DEBT.md`: riesgos y deuda conocidos.
- `RELEASE_CHECKLIST.md`: condiciones pendientes para liberar.
- `SESSION_LOG.md`: registro append-only de cada sesión y punto exacto de relevo.
- `docs/architecture/project-continuity.md`: protocolo obligatorio para conservar contexto.
