# Plan de implementación

Actualizado: 2026-07-14

Fuente publicada: <https://github.com/Proyectokolectivo1/automatizacion-shopify>, rama `main`.

| Fase | Vertical demostrable                | Estado                     | Criterio de salida                                          |
| ---- | ----------------------------------- | -------------------------- | ----------------------------------------------------------- |
| 0    | Descubrimiento técnico y contratos  | PARCIAL                    | inventario de accesos, proveedores e impresoras             |
| 1A   | E0-H1 monorepo, estándares y CI     | COMPLETADA                 | install, quality gate, audit y smoke verdes                 |
| 1B   | E0-H2 entorno local                 | COMPLETADA                 | protocolos, auth, salud y persistencia probados             |
| 1C   | E0-H3 observabilidad base           | COMPLETADA                 | logs, correlación, errores, métricas y readiness probados   |
| 1D   | E0-H4A esquema y migración inicial  | COMPLETADA                 | migración limpia/repetible y constraints probados           |
| 1E   | E0-H4B outbox y colas               | COMPLETADA                 | transacción, publicación, reintentos y DLQ probados         |
| 1F   | E0-H5A login, sesiones y RBAC       | COMPLETADA                 | sesión segura y permisos backend probados                   |
| 1G   | E0-H5B invitación y recuperación    | COMPLETADA                 | tokens de un uso y correo simulado probados                 |
| 1H   | E0-H4C operaciones de DLQ           | COMPLETADA                 | inspección/reproceso autenticados y auditados               |
| 1I   | E0-H5C administración de identidad  | COMPLETADA                 | bootstrap y cambios de rol seguros/auditados                |
| 2A   | E1-H1A registro/tiendas Shopify     | COMPLETADA                 | mock contractual, token cifrado y ciclo de vida probado     |
| 2B   | E1-H2A webhook Shopify simulado     | COMPLETADA                 | HMAC, idempotencia, persistencia y cola probados            |
| 2C   | E1-H3A pedido Shopify simulado      | COMPLETADA                 | snapshot, cliente, items y dirección normalizados           |
| 2D   | E1-H4A clasificación simulada       | COMPLETADA                 | reglas, estados, historial e idempotencia probados          |
| 2E   | E1-H5A conciliación simulada        | COMPLETADA                 | faltantes, fallidos y reproceso acotado probados            |
| 2F   | Shopify real                        | BLOQUEADO_POR_CREDENCIALES | registro remoto, pedido, timeline y conciliación            |
| 3A   | E2-H1A tarifas/pago simulados       | COMPLETADA                 | reglas versionadas y decisión default-deny probadas         |
| 3B   | E2-H2A Wompi simulado               | COMPLETADA                 | adaptador, checkout, firma y replay contractuales           |
| 3C   | E2-H3A webhook Wompi simulado       | COMPLETADA                 | checksum, persistencia y consulta authoritative probados    |
| 3D   | E2-H4A recordatorios simulados      | COMPLETADA                 | agenda 0/8/16/24 h, máximo dos y replay probado             |
| 3E   | E2-H5A vencimiento simulado         | COMPLETADA                 | expirar, cancelar/marcar, historial y replay probados       |
| 3F   | E2-H6A conciliación Wompi simulada  | COMPLETADA                 | diferencias, reporte, alertas y replay probados             |
| 3G   | E3-H1A WhatsApp simulado            | COMPLETADA                 | configuración, contrato, fixture y controles probados       |
| 3H   | E3-H2A plantillas simuladas         | COMPLETADA                 | catálogo, versiones, estados y variables probados           |
| 3I   | E3-H3A envío transaccional simulado | COMPLETADA                 | render, mensaje durable, replay y aceptación local probados |
| 3J   | E3-H4A estados webhook simulados    | SIGUIENTE                  | autenticidad, orden monotónico y replay probados            |
| 3K   | COD + Wompi + WhatsApp reales       | BLOQUEADO_POR_CREDENCIALES | link, mensaje, confirmación y vencimiento reales            |
| 4    | Mastershop                          | BLOQUEADO_POR_PROVEEDOR    | mock contractual y flujo real solo con contrato             |
| 5    | Impresión                           | BLOQUEADO_POR_INVENTARIO   | agente, PDF, spool y reimpresión auditada                   |
| 6    | Operación y dashboard               | PENDIENTE                  | filtros, alertas, métricas y exportación                    |
| 7    | Rentabilidad y publicidad           | BLOQUEADO_POR_DECISION     | snapshots, atribución con confianza y ROAS                  |
| 8    | Hardening y lanzamiento             | PENDIENTE                  | carga, seguridad, restore, piloto y aprobación humana       |

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

Resultado: completada el 2026-07-14. La migración trece crea políticas, reglas y decisiones
tenant-safe. La modalidad prepago/COD ya se determina en E1-H4A y esta vertical resuelve la tarifa
COD por prioridad, especificidad, alcance y vigencia. Cinco pruebas unitarias y tres pruebas
HTTP/PostgreSQL cubren fail-closed, RBAC, tenant, activación, replay, carrera, decisión y outbox.

## Decimosexta vertical: E2-H2A

Implementar `WompiProvider` con simulador determinista, fixtures y pruebas de contrato basadas en la
documentación oficial. Generar únicamente la intención/checkout alojado en simulación, con referencia
única, importe COP, firma de integridad, expiración, idempotencia, auditoría, métricas, flag y kill
switch. No capturar datos de tarjeta, enviar WhatsApp ni usar llaves reales.

Resultado: completada el 2026-07-14. La migración catorce agrega intenciones tenant-safe. El
proveedor simulado firma referencia+monto+COP+expiración con SHA-256 y construye el contrato Web
Checkout sobre `.invalid`. Seis pruebas cubren firma, campos controlados, RBAC, tenant, carrera,
replay y outbox.

## Decimoséptima vertical: E2-H3A

Recibir un evento `transaction.updated` sintético, validar checksum sobre cuerpo recibido, persistirlo
idempotentemente y consultar el estado authoritative mediante `WompiProvider` antes de comparar
referencia, monto y moneda. No confirmar pagos ni mover pedidos usando solo el webhook.

Resultado: completada el 2026-07-14. La migración quince crea eventos de proveedor tenant-safe. El ingreso valida cuerpo crudo, checksum, tiempo e idempotencia; consulta el simulador authoritative y compara id, referencia, monto, moneda y estado antes de actualizar intención y outbox atómicamente. Once pruebas Wompi cubren aprobación, carrera, replay, firma y divergencias.

## Decimoctava vertical: E2-H4A

Programar recordatorios sintéticos a 0/8/16/24 horas con máximo dos entregas, outbox idempotente, cancelación al dejar `PENDING` y controles fail-closed. No enviar WhatsApp real.

Resultado: completada el 2026-07-14. La migración dieciséis crea exactamente dos ventanas tenant-safe
por intención. Hora 0 permanece como creación del enlace, los recordatorios se programan a +8/+16 y
hora 24 queda para E2-H5A. El scheduler usa locks `SKIP LOCKED`, outbox y auditoría atómicos; aprobación
o vencimiento cancelan lo pendiente. Trece pruebas Wompi cubren agenda, carrera, replay y cancelación.

## Decimonovena vertical: E2-H5A

Expirar intenciones pendientes al cumplir 24 horas, cancelar recordatorios, registrar historial y
aplicar en simulación la política configurable `MARK` o `CANCEL`. Como DP-002 sigue abierta, el valor
por defecto debe ser `MARK` y ninguna mutación Shopify real está permitida.

Resultado: completada el 2026-07-14. La migración diecisiete agrega estados, acción histórica y
`expired_at` con constraints. El scheduler vence y transiciona en una sola transacción, cancela
recordatorios, emite outbox sin PII y serializa la carrera con webhooks. `CANCEL` solo solicita una
acción simulada; una aprobación tardía no reescribe el estado y mueve el pedido a revisión manual.
Diecisiete pruebas Wompi cubren expiración, replay, tenant, ambas políticas y concurrencia.

## Vigésima vertical: E2-H6A

Implementar conciliación diaria Wompi exclusivamente en simulación: ventana/checkpoint durable,
comparación entre intenciones, eventos y estado authoritative del proveedor simulado, diferencias
deduplicadas, reporte, outbox de alerta, métricas, scheduler, flag y kill switch. No corregir estados
automáticamente ni llamar proveedores reales.

Resultado: completada el 2026-07-14. La migración dieciocho separa checkpoints, reportes e incidencias
financieras tenant-safe. El scheduler serializa cada tienda, no avanza la ventana si falla el
proveedor, compara intención/evento/authoritative, deduplica por huella y solo alerta por outbox. Las
21 pruebas Wompi cubren replay, carrera, caída, divergencia, resolución y aislamiento sin autocorrección.

## Vigesimoprimera vertical: E3-H1A

Implementar configuración WhatsApp Cloud API exclusivamente simulada: contrato de proveedor, fixture
versionado, credenciales sintéticas/cifradas, prueba de conexión, flags, modo simulación y kill switch.
No enviar mensajes, registrar plantillas remotas ni llamar Meta sin credenciales.

Resultado: completada el 2026-07-14. La migración diecinueve valida la configuración y hace único el
`phoneNumberId` entre tenants. El límite `WhatsAppProvider`, fixture v1, cifrado AES-256-GCM con AAD,
ciclo probar/activar/desactivar/rotar, idempotencia, outbox, auditoría y métrica permanecen solo en
simulación. Las pruebas cubren contrato, keyring, RBAC, tenant, replay, carrera y fail-closed.

## Vigesimosegunda vertical: E3-H2A

Implementar un catálogo local tenant-safe de plantillas WhatsApp exclusivamente simulado: nombre
interno/Meta, idioma, categoría, cuerpo, esquema de variables, evento, versión y estado. Debe incluir
idempotencia, activación segura, auditoría, métricas, constraints, fixtures y pruebas; no registrar ni
consultar plantillas reales y no asumir que Meta las aprobará.

Resultado: completada el 2026-07-14. La migración veinte agrega versiones inmutables tenant-safe,
forma JSON y unicidad de activación por tienda/evento/idioma. La API crea, versiona, revisa, activa,
desactiva y lista con replay, advisory locks, RBAC, outbox, auditoría y métricas. Los estados siempre
distinguen `simulated_approved` de una aprobación Meta real.

## Vigesimotercera vertical: E3-H3A

Implementar envío transaccional exclusivamente simulado: resolver la versión activa por evento e
idioma, validar/renderizar variables sintéticas, persistir el mensaje/intento de forma tenant-safe e
idempotente y emitir outbox para entrega local. Debe probar replay, carrera, plantilla ausente,
variables inválidas, kill switch y trazabilidad; no llamar Meta ni marcar un mensaje como enviado real.

Resultado: completada el 2026-07-14. La migración veintiuno agrega conversaciones y mensajes
tenant-safe e inmutables. La API exige conexión saludable, consentimiento, E.164 y plantilla activa;
renderiza tipos v1, deduplica por efecto de negocio y persiste `simulated_accepted` con outbox,
auditoría y métricas sin PII. El mock determinista no usa red y ningún timestamp Meta se completa.

## Vigesimocuarta vertical: E3-H4A

Implementar el ciclo de estados exclusivamente simulado mediante webhook autenticado: evento durable,
idempotencia, orden monotónico y transiciones permitidas sin aceptar regresiones ni afirmar entregas
Meta reales. Mantener el ingreso real bloqueado hasta validar firma y contrato oficiales.
