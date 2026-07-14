# Plan de implementación

Actualizado: 2026-07-14

Fuente publicada: <https://github.com/Proyectokolectivo1/automatizacion-shopify>, rama `main`.

| Fase | Vertical demostrable               | Estado                     | Criterio de salida                                        |
| ---- | ---------------------------------- | -------------------------- | --------------------------------------------------------- |
| 0    | Descubrimiento técnico y contratos | PARCIAL                    | inventario de accesos, proveedores e impresoras           |
| 1A   | E0-H1 monorepo, estándares y CI    | COMPLETADA                 | install, quality gate, audit y smoke verdes               |
| 1B   | E0-H2 entorno local                | COMPLETADA                 | protocolos, auth, salud y persistencia probados           |
| 1C   | E0-H3 observabilidad base          | COMPLETADA                 | logs, correlación, errores, métricas y readiness probados |
| 1D   | E0-H4A esquema y migración inicial | COMPLETADA                 | migración limpia/repetible y constraints probados         |
| 1E   | E0-H4B outbox y colas              | COMPLETADA                 | transacción, publicación, reintentos y DLQ probados       |
| 1F   | E0-H5A login, sesiones y RBAC      | COMPLETADA                 | sesión segura y permisos backend probados                 |
| 1G   | E0-H5B invitación y recuperación   | COMPLETADA                 | tokens de un uso y correo simulado probados               |
| 1H   | E0-H4C operaciones de DLQ          | COMPLETADA                 | inspección/reproceso autenticados y auditados             |
| 1I   | E0-H5C administración de identidad | COMPLETADA                 | bootstrap y cambios de rol seguros/auditados              |
| 2A   | E1-H1A registro/tiendas Shopify    | COMPLETADA                 | mock contractual, token cifrado y ciclo de vida probado   |
| 2B   | E1-H2A webhook Shopify simulado    | COMPLETADA                 | HMAC, idempotencia, persistencia y cola probados          |
| 2C   | E1-H3A pedido Shopify simulado     | COMPLETADA                 | snapshot, cliente, items y dirección normalizados         |
| 2D   | E1-H4A clasificación simulada      | COMPLETADA                 | reglas, estados, historial e idempotencia probados        |
| 2E   | E1-H5A conciliación simulada       | COMPLETADA                 | faltantes, fallidos y reproceso acotado probados          |
| 2F   | Shopify real                       | BLOQUEADO_POR_CREDENCIALES | registro remoto, pedido, timeline y conciliación          |
| 3A   | E2-H1A tarifas/pago simulados      | SIGUIENTE                  | reglas versionadas y decisión default-deny probadas       |
| 3B   | COD + Wompi + WhatsApp reales      | BLOQUEADO_POR_CREDENCIALES | link, mensaje, confirmación y vencimiento reales          |
| 4    | Mastershop                         | BLOQUEADO_POR_PROVEEDOR    | mock contractual y flujo real solo con contrato           |
| 5    | Impresión                          | BLOQUEADO_POR_INVENTARIO   | agente, PDF, spool y reimpresión auditada                 |
| 6    | Operación y dashboard              | PENDIENTE                  | filtros, alertas, métricas y exportación                  |
| 7    | Rentabilidad y publicidad          | BLOQUEADO_POR_DECISION     | snapshots, atribución con confianza y ROAS                |
| 8    | Hardening y lanzamiento            | PENDIENTE                  | carga, seguridad, restore, piloto y aprobación humana     |

## Verticales completadas

- E0-H1: checkout reproducible, estándares, CI, pruebas y builds.
- E0-H2: PostgreSQL, Redis y S3-compatible locales, autenticados y persistentes.
- E0-H3: logs Pino redactados, correlation ID, errores seguros, Prometheus y readiness real. La
  prueba runtime degrada ante caída de Redis, conserva sanas las demás dependencias y recupera.

## Cuarta vertical: E0-H4A

Actor: desarrollador. Entrada: PostgreSQL saludable y configuración validada. Salida: esquema mínimo
versionado y verificable desde una base vacía. Efectos: crea exclusivamente estructuras locales.

Criterios de aceptación:

1. Prisma y sus versiones quedan fijados en lockfile.
2. La primera migración expand-only crea organizaciones, tiendas, claves idempotentes y outbox.
3. Claves foráneas, unicidad, estados, timestamps e índices reflejan invariantes explícitas.
4. La migración funciona desde una base vacía y su reaplicación es segura/no-op.
5. Pruebas de integración usan PostgreSQL real y verifican constraints críticos.
6. Rollback operativo y límites de la migración quedan documentados.

Fuera de alcance: publicador outbox, BullMQ, pedidos, autenticación e integraciones reales.

Resultado: completada el 2026-07-12. La migración fue aplicada en una base temporal vacía y en la
base local, reaplicada como no-op, comparada sin drift y ejercitada mediante Prisma y PostgreSQL real.

## Quinta vertical: E0-H4B

Implementar el límite transaccional y la entrega asíncrona: Prisma lifecycle en NestJS, persistencia
de agregado + outbox en una transacción, claim concurrente seguro, BullMQ, reintentos acotados, DLQ,
idempotencia y pruebas de caída/recuperación. No incluir pedidos ni proveedores reales.

Resultado: completada el 2026-07-12. La suite aislada confirma atomicidad, replay, rollback,
concurrencia, Redis inaccesible/recuperado, reintentos y DLQ sobre servicios reales.

## Sexta vertical: E0-H5A

Implementar identidad local mínima, membresías organizacionales, almacenamiento robusto de
contraseñas, sesiones revocables y autorización RBAC en backend. El correo permanecerá detrás de un
adaptador con simulación, flag y kill switch mientras no exista proveedor decidido.

Resultado: completada el 2026-07-12. Login uniforme, Argon2id, access/refresh opacos, rotación,
revocación, rate limit, auditoría, RBAC y aislamiento de tenant se probaron sobre PostgreSQL real.

## Séptima vertical: E0-H5B

Completar invitaciones y recuperación con tokens de un solo uso, hash persistido, expiración,
revocación y replay seguro. Usar el adaptador de correo únicamente en simulación mientras DP-001 siga pendiente.

Resultado: completada el 2026-07-13. Cinco migraciones y pruebas HTTP/PostgreSQL confirman emisión
CSPRNG, consumo único/concurrente, expiración, jerarquía de roles, tenant, respuesta uniforme,
revocación de sesiones y correo simulado fail-closed.

## Octava vertical: E0-H4C

Agregar ownership organizacional explícito a eventos/jobs y una superficie operativa protegida para
consultar DLQ y reprocesar exactamente un evento de forma idempotente, auditada y desactivable. Debe
probar tenant isolation, paginación, carreras y respuesta perdida sobre PostgreSQL/Redis reales.

Resultado: completada el 2026-07-14. La sexta migración incorpora ownership y generaciones de
entrega; cinco pruebas HTTP/PostgreSQL/Redis confirman redacción, RBAC, tenant, replay idempotente,
carreras y publicación con un `jobId` nuevo. Los controles operativos quedan cerrados por defecto.

## Novena vertical: E0-H5C

Implementar un bootstrap local, explícito y de un solo uso para el primer owner, más endpoints
owner/admin para listar membresías, cambiar roles permitidos y revocar acceso. Toda mutación debe ser
idempotente, tenant-safe, auditada y protegida con flags/kill switch. No incluir registro público,
correo real, UI de sesión ni despliegue.

Resultado: completada el 2026-07-14. Un comando sin argumentos crea exactamente un primer owner
bajo lock global. Cinco pruebas PostgreSQL/HTTP y controles unitarios cubren doble bootstrap,
paginación, tenant, RBAC, escalamiento, último owner, idempotencia, carreras y sesiones revocadas.
La API y el bootstrap quedan apagados y con kill switch activo por defecto.

## Décima vertical: E1-H1A

Crear el registro de integraciones y el ciclo de vida mínimo de tiendas Shopify. Como no existen
credenciales, entregar interfaz/adaptador, mock determinista, fixtures y pruebas de contrato; cifrar
tokens en reposo con claves versionadas, no exponerlos y mantener conexión real desactivada mediante
flag, simulación y kill switch. Probar tenant, duplicados, rotación, activar/desactivar y auditoría.

Resultado: completada el 2026-07-14. Dos migraciones agregan y endurecen el registro tenant-safe; el token
se cifra con AES-256-GCM/AAD y keyring versionado. Treinta pruebas unitarias y cuatro pruebas
PostgreSQL/HTTP cubren mock, flags, SSRF, duplicados, concurrencia, replay, RBAC, tenant, rotación,
salud, activación/desactivación, auditoría y métricas. No hubo tráfico a Shopify.

## Undécima vertical: E1-H2A

Recibir fixtures de webhooks Shopify en modo simulado: preservar cuerpo crudo, validar HMAC con
secreto cifrado/versionado, deduplicar por tienda/topic/webhook, persistir recepción y outbox en una
transacción, responder rápido y procesar en cola. La suscripción real queda bloqueada.

Resultado: completada el 2026-07-14. La novena migración añade eventos webhook tenant-safe y secreto
cifrado. Cuatro pruebas PostgreSQL/Redis/HTTP y dos unitarias confirman HMAC previo al parseo,
allowlist, límite de cuerpo, replay, carrera, colisión de identificador, outbox atómico y recuperación
tras caída de Redis. Solo se acepta el fixture sintético `orders/create`; no hubo tráfico externo.

## Duodécima vertical: E1-H3A

Ampliar el proveedor Shopify simulado para consultar el pedido indicado por un webhook verificado y
persistir, en una transacción idempotente, el snapshot del pedido, cliente, items y dirección. El
modelo debe conservar ownership por organización/tienda, dinero en unidades menores, timestamps del
proveedor, payload normalizado versionado y trazabilidad al evento de origen. Probar replay, carrera,
payload incompleto, tenant, pedido tardío y fallo/reintento. La API real seguirá cerrada por flags.

Resultado: completada el 2026-07-14. La décima migración añade clientes, direcciones, pedidos e items
con FKs tenant y constraints monetarios. El worker consulta el fixture mediante `ShopifyProvider`,
valida Zod, persiste el agregado y outbox atómicamente, y evita que snapshots tardíos sobrescriban
versiones nuevas. Las suites cubren concurrencia, replay, actualización, tardíos, Redis, DLQ y flags.

## Decimotercera vertical: E1-H4A

Implementar clasificación de pedido independiente del proveedor: reglas versionadas/configurables
para pago anticipado y contraentrega, transición desde `RECEIVED`, historial inmutable, evento outbox,
auditoría, métricas e idempotencia. Probar ambigüedad, configuración por tienda, replay, carrera y
reglas desconocidas. Wompi, WhatsApp, Mastershop y mutaciones remotas quedan fuera de alcance.

Resultado: completada el 2026-07-14. La migración once agrega políticas versionadas y un historial
inmutable. El worker clasifica el evento sincronizado con reglas estrictas, persiste tres
transiciones y emite `order.classified.v1` atómicamente. Pruebas unitarias, PostgreSQL y Redis cubren
prepago, COD, ambigüedad, ausencia de regla, estado inválido, replay y carrera.

## Decimocuarta vertical: E1-H5A

Implementar conciliación únicamente en simulación para detectar pedidos faltantes o fallidos y
reprocesar un pedido/evento de forma tenant-safe, acotada, idempotente y auditada. Incluir métricas,
flags, kill switch y pruebas de carrera; no consultar Shopify real ni iniciar pagos o logística.

Resultado: completada el 2026-07-14. La migración doce agrega checkpoint por tienda, incidencias
deduplicadas y origen interno explícito. Tres pruebas HTTP/PostgreSQL cubren ventana, RBAC, tenant,
faltantes, webhooks fallidos, replay concurrente, outbox y resolución. La conexión real permanece
cerrada y no se fingieron firmas HMAC.

## Decimoquinta vertical: E2-H1A

Modelar reglas versionadas de tarifas y modalidades de pago con prioridad determinista, vigencia,
ownership por tienda y decisión fail-closed. Entregar fixtures y pruebas de contrato en simulación,
con flags y kill switch. No crear links Wompi ni enviar WhatsApp.
