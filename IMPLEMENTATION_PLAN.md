# Plan de implementación

Actualizado: 2026-07-18

Fuente publicada: <https://github.com/Proyectokolectivo1/automatizacion-shopify>, rama `main`.

| Fase | Vertical demostrable                | Estado                     | Criterio de salida                                          |
| ---- | ----------------------------------- | -------------------------- | ----------------------------------------------------------- |
| 0    | Descubrimiento técnico y contratos  | PARCIAL                    | inventario de accesos, proveedores e impresoras             |
| 1A   | E0-H1 monorepo, estándares y CI     | COMPLETADA                 | install, quality gate, audit y smoke verdes                 |
| 1B   | E0-H2 entorno local                 | COMPLETADA                 | protocolos, auth, salud y persistencia probados             |
| 1C   | E0-H3 observabilidad base           | COMPLETADA                 | logs, correlación, errores, métricas y readiness probados   |
| 1C2  | E0-H3B observabilidad conectada     | COMPLETADA                 | trazas, alertas y acceso seguro a métricas probados         |
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
| 3J   | E3-H4A estados webhook simulados    | COMPLETADA                 | autenticidad, orden monotónico y replay probados            |
| 3K   | E3-H5A mensajes entrantes simulados | COMPLETADA                 | ingreso durable, dedupe, tenant y redacción probados        |
| 3L   | E3-H6A bandeja simulada             | COMPLETADA                 | consulta, timeline y filtros tenant-safe probados           |
| 3M   | E3-H7A asignación simulada          | COMPLETADA                 | ownership, carrera, RBAC y auditoría probados               |
| 3N   | COD + Wompi + WhatsApp reales       | BLOQUEADO_POR_CREDENCIALES | link, mensaje, confirmación y vencimiento reales            |
| 4    | Mastershop                          | BLOQUEADO_POR_PROVEEDOR    | mock contractual y flujo real solo con contrato             |
| 5    | Impresión                           | BLOQUEADO_POR_INVENTARIO   | agente, PDF, spool y reimpresión auditada                   |
| 6A   | E6-H1A cola operativa unificada     | COMPLETADA                 | lectura, filtros y paginación tenant-safe probados          |
| 6B   | E6-H2A resumen operativo agregado   | COMPLETADA                 | conteos y ventana tenant-safe probados                      |
| 6C   | E6-H3A base segura del dashboard    | COMPLETADA                 | cookie/CSRF/BFF y lectura tenant-safe probados              |
| 6D   | E6-H4A alertas operativas internas  | COMPLETADA                 | reglas, estado durable y dedupe probados                    |
| 6E   | E6-H5A búsqueda operativa           | COMPLETADA                 | búsqueda tenant-safe, acotada y sin PII                     |
| 6F   | E6-H6A detalle operativo mínimo     | COMPLETADA                 | navegación de solo lectura con redacción por tipo           |
| 6G   | E6-H7A export operativo             | COMPLETADA                 | exportación acotada, redactada y auditable                  |
| 7    | Rentabilidad y publicidad           | BLOQUEADO_POR_DECISION     | snapshots, atribución con confianza y ROAS                  |
| 8    | Hardening y lanzamiento             | EN_PROGRESO                | carga, seguridad, restore, piloto y aprobación humana       |

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

Resultado: completada el 2026-07-14. Las migraciones veintidós y veintitrés amplían los estados y
agregan evento/historial inmutables tenant-safe. El webhook sintético v1 autentica bytes crudos con
un secreto separado del token, deduplica, serializa carreras y aplica transiciones monotónicas. Firma,
replay, colisión, desconocidos, eventos tardíos, terminales, RBAC, kill switch y redacción están
probados sin tráfico Meta.

## Vigesimoquinta vertical: E3-H5A

Implementar mensajes entrantes exclusivamente simulados reutilizando el ingreso sintético
autenticado con un tipo/fixture versionado propio. Persistir mensaje y conversación tenant-safe con
deduplicación, consentimiento/identidad no reveladora, retención/redacción explícitas, outbox,
auditoría y métricas acotados. Probar firma, replay, carrera, desconocidos, aislamiento y kill switch;
no aceptar el payload Meta real ni construir todavía la bandeja E3-H6.

Resultado: completada el 2026-07-15. Las migraciones veinticuatro a veintiséis agregan el estado
inbound, contenido cifrado, conversaciones seudónimas, eventos inmutables y unicidad tenant-safe. El fixture
estricto se autentica antes de parsear, deduplica evento/mensaje y resuelve identidad solo dentro de
la tienda. Texto, teléfono e ID externo quedan fuera de outbox, auditoría y métricas; firma, replay,
colisión, carrera, desconocidos, tenant, kill switch, retención marcada y redacción están probados.

## Vigesimosexta vertical: E3-H6A

Implementar una bandeja de conversaciones exclusivamente simulada: listado paginado tenant-safe,
timeline de mensajes, filtros acotados y acceso RBAC. El contenido inbound debe descifrarse solo para
usuarios autorizados, nunca después de su vencimiento ni en logs/métricas; no responder mensajes,
asignar agentes todavía ni invocar Meta.

Resultado: completada el 2026-07-17 sin migraciones nuevas. La API protegida lista conversaciones y
timeline mediante cursores keyset, filtros acotados y lookup tenant-safe. Solo roles operativos
autorizados reciben contenido; inbound vencido nunca se descifra. RBAC, paginación, cursor inválido,
direcciones, historial, expiración, tenant, kill switch, auditoría y métricas sin PII están probados.

## Vigesimoséptima vertical: E3-H7A

Implementar asignación de conversaciones exclusivamente simulada: agente elegible dentro del tenant,
claim/reassign/unassign con versión o lock, RBAC, historial durable, auditoría, métricas y carrera
determinista. No responder mensajes ni conectar Meta.

Resultado: completada el 2026-07-17. La migración veintisiete agrega asignación actual versionada e
historial inmutable tenant-safe. Support reclama para sí y owner/admin/operations gestionan
reassign/unassign mediante membresías activas y elegibles. Lock serializable, expected version,
idempotencia, carrera, RBAC, outbox, auditoría y métricas sin PII están probados; no hubo tráfico
Meta.

## Vigesimoctava vertical: E0-H3B

Completar la observabilidad base con propagación W3C, exportación OTLP a un Collector local,
correlación logs/traces, alertas de fallo/recuperación y acceso seguro a métricas. Los exporters deben
tener timeout, flags y kill switch; una caída de telemetría no puede tumbar la API. No conectar
servicios cloud ni afirmar preparación productiva.

Resultado: completada el 2026-07-17 sin migraciones nuevas. La API crea spans HTTP manuales de baja
cardinalidad, continúa `traceparent`, exporta a Collector y correlaciona trace/span IDs con Pino. Las
transiciones de readiness notifican una sola alerta activa/resuelta vía Alertmanager y receptor local.
`/metrics` queda loopback por defecto, admite Bearer técnico con comparación constante y lo exige en
producción. El gate runtime prueba propagación, redacción, dedupe, recuperación y caída de Collector.
La siguiente vertical es E6-H1A.

## Vigesimonovena vertical: E6-H1A

Construir una cola operativa unificada de solo lectura sobre pedidos, incidencias de conciliación,
intenciones de pago y conversaciones existentes. Debe tener ownership organizacional, RBAC,
filtros enumerados, paginación keyset, orden estable y proyección mínima sin PII innecesaria. No crear
una UI completa, mutar estados, corregir incidencias ni conectar proveedores reales.

Resultado: completada el 2026-07-17. La migración veintiocho agrega cinco índices tenant+timestamp+
UUID. Una sola consulta `UNION ALL` proyecta los cinco tipos con organización aplicada dentro de
cada rama, atención v1 determinista, filtros estrictos y cursor estable. Owner/admin/operations
pueden leer la mínima proyección; soporte y demás roles quedan default-deny. Cinco pruebas dedicadas,
28 migraciones desde vacío y la regresión completa pasaron sin PII, N+1 ni mutaciones.

## Trigésima vertical: E6-H2A

Construir un resumen operativo agregado de solo lectura sobre la política v1 de E6-H1A. Debe aceptar
una ventana temporal acotada, devolver conteos por tipo/estado/atención con contrato versionado,
mantener aislamiento tenant, RBAC, auditoría, métricas y controles fail-closed. No duplicar una
segunda semántica de atención, crear todavía el dashboard visual, emitir alertas ni mutar recursos.

Resultado: completada el 2026-07-17 sin migración nueva. Cola y resumen comparten una única consulta
tenant-safe y política de atención v1. El endpoint exige ventana `[from,to)` de máximo 31 días y usa
`GROUPING SETS` para devolver totales y desgloses por tipo/estado en una sola consulta. Siete pruebas
cubren consistencia, filtros, cero resultados, rangos, RBAC, tenant, auditoría, métrica, redacción y
kill switch; no se exponen IDs ni PII.

## Trigesimoprimera vertical: E6-H3A

Construir la base segura del dashboard Next.js de solo lectura. Debe resolver autenticación web sin
Bearer en localStorage mediante cookie HttpOnly/SameSite y protección CSRF o BFF, selección de
organización tenant-safe y consumo mínimo de cola/resumen. Añadir pruebas web/E2E proporcionales y
controles fail-closed. No habilitar mutaciones, proveedores reales, alertas automáticas ni release.

Resultado: completada el 2026-07-17 sin migración nueva. Next.js actúa como BFF: access/refresh solo
viven en cookies HttpOnly/SameSite/Secure en producción, y toda rotación/revocación usa origen+CSRF.
El login obtiene membresías activas después de verificar credenciales; cada lectura deriva tenant de
`/auth/me` y elimina IDs/PII antes del navegador. El dashboard responsive consume resumen/cola,
filtra ventanas/tipo, pagina con cursor opaco y cubre loading/empty/error. Auth 16/16 y web 8/8.

## Trigesimosegunda vertical: E6-H4A

Construir alertas operativas internas, durables y deduplicadas sobre la política de atención v1. Las
reglas deben ser explícitas/versionadas, con ventanas acotadas, ownership tenant, transiciones
idempotentes, auditoría, métricas, flag y kill switch. La primera versión solo registra y permite
leer alertas internas; no envía correo/WhatsApp, no autocorrige recursos y no conecta proveedores.

Resultado: completada con cinco reglas v1, migración de tabla más ajuste forward-only de índices,
scheduler acotado, estado
open/resolved durable, dedupe concurrente, API de solo lectura, auditoría, métricas y 7/7 pruebas.

## Trigesimotercera vertical: E6-H5A

Construir búsqueda operativa global de solo lectura sobre el read model compartido. Debe fijar antes
de editar el contrato de campos consultables, ventana, límites, ranking/orden estable, redacción y
RBAC. Detalle sensible y exportaciones permanecen fuera de esta vertical.

Resultado: completada con búsqueda limitada a ID interno exacto/tipo/estado/motivo, ventana máxima
31 días, límite 50, ranking estable, cursor ligado a consulta, RBAC tenant-safe, auditoría sin término,
métrica acotada, BFF redactado, flag/kill switch y pruebas negativas.

## Trigesimocuarta vertical: E6-H6A

Estado: `COMPLETADA`.

Objetivo: construir detalle operativo mínimo de solo lectura por tipo, accesible desde el dashboard
mediante una referencia opaca y temporal. No exponer UUID, tienda, relaciones internas, PII, cuerpos,
snapshots, secretos, evidencia cruda ni referencias de proveedor al navegador.

Requisitos cubiertos:

- lookup API tenant-safe por `type` + UUID, con respuesta uniforme `404` y permiso propio;
- proyección v1 discriminada para los cinco tipos del read model, solo con campos operativos acotados;
- timeline máximo de 25 eventos cuando exista historial seguro y sin metadata libre;
- referencia web AES-256-GCM, ligada a organización y con expiración máxima de 15 minutos;
- BFF que deriva tenant de `/auth/me`, resuelve la referencia y vuelve a redactar el contrato;
- panel accesible con loading/error/close, sin mutaciones ni exportaciones;
- auditoría sin IDs fuente en metadata, métrica de cardinalidad fija, flag y kill switch independientes.

Archivos previstos: controller/service/contratos de detalle en API, permisos/config/métricas/AppModule,
helper criptográfico y ruta BFF, contratos/componentes/estilos web, pruebas integradas API/BFF y
documentación de contrato, seguridad, testing y runbook.

Dependencias: read model operativo v1, sesiones BFF E6-H3A, búsqueda E6-H5A, Prisma/PostgreSQL y
`WEB_DETAIL_REFERENCE_KEY` local generado por bootstrap. No requiere proveedor externo ni migración.

Pruebas requeridas: cinco tipos, timeline acotado, redacción, referencia válida/expirada/adulterada,
RBAC, tenant ajeno, recurso inexistente, entrada inválida, auditoría, métrica, flag/kill switch, BFF y
regresión completa (`pnpm validate`, `operations:verify`, `web:verify`, `database:verify`).

Riesgos conocidos: exposición indirecta de identificadores, replay de referencias, divergencia entre
proyecciones y lectura operativa, serialización de `BIGINT` y filtración desde JSON libres. Mitigación:
cifrado autenticado con TTL/tenant, allowlists por tipo, no seleccionar columnas JSON y límites duros.

Resultado: API discriminada para cinco tipos, timeline seguro máximo 25, RBAC/tenant/404 uniforme,
auditoría/métrica/flags y referencias AES-256-GCM de 15 minutos integradas con BFF/dashboard. Pasan
`operations:verify` 11/11, `web:verify` 11/11, `validate` 84/84 y `database:verify` 16/16.

## Trigesimoquinta vertical: E6-H7A

Estado: `COMPLETADA`.

Objetivo: descargar un CSV operativo reproducible desde el dashboard sin crear archivos durables ni
ampliar la superficie de datos del read model.

Requisitos cubiertos:

- API interna devuelve filas JSON validadas; únicamente el BFF serializa CSV;
- ventana `[from,to)` obligatoria de máximo 7 días, límite configurable de 1 a 1.000 filas;
- campos exclusivos: `occurred_at`, `type`, `status`, `requires_attention`, `attention_reason`;
- orden estable por fecha/clave descendente y señal `truncated` cuando existen más filas;
- permiso `operations.export.read` solo para OWNER/ADMIN y rate limit durable de 5 solicitudes/minuto;
- CSV UTF-8 con CRLF, comillas RFC 4180 y prefijo seguro ante `=`, `+`, `-`, `@`, tab o retorno;
- descarga BFF `no-store`, `attachment`, sin persistencia local/S3/DB y sin UUID/PII;
- auditoría sin filas ni IDs, métrica acotada, feature flag y kill switch independientes.

Archivos previstos: export controller/service API, permisos/config/métricas/AppModule, contrato y ruta
BFF/serializador CSV, botón de dashboard, pruebas integradas API/web y documentación completa.

Dependencias: read model E6-H1A, resumen/búsqueda, sesiones BFF, tabla durable `auth_rate_limits` y
roles existentes. No requiere migración ni proveedor externo.

Pruebas requeridas: límites/ventana/filtros, orden/truncado, CSV/headers/fórmulas/Unicode, RBAC,
tenant, rate limit, PII, auditoría, métrica, flag/kill switch, build y regresión completa.

Riesgos conocidos: exfiltración masiva, CSV injection, respuestas grandes, fórmulas al abrir en Excel,
confusión con búsqueda activa y persistencia accidental. Mitigación: owner/admin, 7 días/1.000 filas,
rate limit, allowlist, serializer probado, botón deshabilitado durante búsqueda y generación en memoria.

Resultado: API JSON acotada, BFF CSV RFC 4180/BOM/CRLF, protección de fórmulas, owner/admin,
rate limit durable, auditoría/métrica/flags y descarga sin persistencia. Pasan `operations:verify`
12/12, `web:verify` 13/13, `database:verify` 16/16 e infraestructura persistente.

## Trigesimosexta vertical: E9-H1A

Estado: `COMPLETADA`.

Objetivo: demostrar que la base PostgreSQL local puede respaldarse y restaurarse de forma
reproducible sin modificar la base fuente. La restauración debe ocurrir en una base temporal aislada,
dejar evidencia de duración e integridad y limpiar todo artefacto que pueda contener datos.

Requisitos:

- dump custom mediante herramientas PostgreSQL de la misma imagen fijada en Compose;
- base de restauración con nombre aleatorio, distinta a la fuente y eliminada incluso ante fallos;
- comparación exacta de conteos por tabla, migraciones aplicadas, constraints, índices y secuencias;
- ejecución fail-fast, sin imprimir credenciales, filas, nombres sensibles ni contenido del dump;
- dump temporal con permisos restrictivos y eliminación obligatoria; solo persiste un reporte sin datos;
- tiempos separados de backup, restore y verificación, más tamaño del archivo y duración total;
- comando raíz reproducible y gate en CI después de migraciones/constraints;
- documentación explícita de que esta prueba local no constituye backup externo ni garantiza RPO/RTO.

Archivos previstos: `scripts/verify-postgres-backup.mjs`, script raíz `backup:verify`, exclusión de
`.artifacts/`, gate CI, runbook, documento de arquitectura/testing y registros maestros del proyecto.

Dependencias: Docker Compose saludable, PostgreSQL 17 fijado, esquema migrado y utilidades
`pg_dump`/`pg_restore` incluidas en la imagen. No requiere proveedor, credencial real ni migración.

Pruebas requeridas: dump no vacío, restore con `--exit-on-error` y transacción única, equivalencia de
manifiestos, ausencia final de base temporal y dump, reporte sin contenido de negocio, lint/formato,
`database:verify`, `backup:verify` y regresión completa `pnpm validate`.

Riesgos conocidos: dump local sin cifrar, espacio insuficiente, base con escrituras concurrentes,
restauración accidental sobre la fuente, cleanup incompleto y falsa interpretación de objetivos de
continuidad. Mitigación: nombre generado y validado, directorio ignorado, modo `0600`, `finally`
destructivo solo sobre el nombre temporal, entorno local quiescente y límites documentales claros.

Resultado: `backup:verify` genera un dump custom temporal, restaura con transacción única en una base
aleatoria y compara exactamente 39 tablas, 30 migraciones aplicadas, historial, constraints, índices
y secuencias. La segunda medición registró 360 ms de backup, 890 ms de restore, 323 ms de verificación
y 3.523 ms totales. Base y dump se eliminaron; solo quedó un reporte local ignorado y sin datos.
Pasan `database:verify` 16/16 y `pnpm validate` 86/86 con ambos builds.

## Trigesimoséptima vertical: E9-H2A

Estado: `COMPLETADA`.

Objetivo: demostrar en infraestructura local que el pipeline simulado puede ingerir y completar 500
pedidos, tolerar una ráfaga concurrente, acumular backlog con el publicador cerrado y drenarlo al
recuperar outbox/Redis sin duplicados ni dead letters.

Requisitos:

- fixture Shopify sintético v1 parametrizable solo para un rango reservado de IDs de carga;
- base PostgreSQL y colas Redis aisladas por ejecución, migradas desde cero y eliminadas al finalizar;
- 500 webhooks firmados enviados por HTTP con concurrencia 25 y respuesta `202` sin errores;
- backlog durable de exactamente 500 eventos antes de habilitar publicación/worker;
- pipeline webhook -> outbox -> sync de pedido -> outbox -> clasificación completo;
- ráfaga posterior de 50 replays que no cree webhooks, pedidos ni jobs de negocio adicionales;
- umbrales locales explícitos: ingreso >=5 req/s, p95 <=2.500 ms, drain >=2 pedidos/s y <=120 s;
- cero estados failed/dead-letter al cerrar y 500 pedidos `READY_FOR_LOGISTICS` con historial esperado;
- reporte agregado ignorado, sin IDs, payloads, PII, secretos ni extrapolación a producción;
- comando dedicado y gate CI después de la regresión funcional.

Archivos previstos: proveedor mock parametrizado y prueba contractual, suite/config de carga integrada,
scripts package/CI, arquitectura, testing, runbook y registros maestros.

Dependencias: pipeline simulado E1-H1A..H4A, outbox/BullMQ E0-H4B, PostgreSQL/Redis locales, fixture
versionado y HMAC existente. No requiere Shopify real, datos personales, credenciales ni migración.

Pruebas requeridas: allowlist del rango de fixture, rechazo fuera del rango, 500 ingress únicos,
latencia/throughput, backlog pre-recovery, drain, estados finales, replay, ausencia de DLQ, cleanup,
reporte redactado, gates Shopify/outbox, `load:verify`, `database:verify` y `pnpm validate`.

Riesgos conocidos: umbrales inestables por hardware/CI, mock confundido con capacidad real, saturación
del pool, datos de prueba persistentes, rango sintético aceptado fuera del gate y falsos éxitos por
inserciones directas. Mitigación: márgenes amplios respecto a 500/día, modo/fixture explícitos, HTTP y
pipeline real local, IDs reservados estrictos, recursos aislados, cleanup y reporte agregado.

Resultado: el gate final ingirió 500 webhooks firmados con concurrencia 25 a 140,36 req/s y p95 251 ms;
acumuló 500 eventos y los drenó con cuatro publicadores/worker 50 en 7.843 ms a 63,75 pedidos/s. Los
500 pedidos alcanzaron `READY_FOR_LOGISTICS`, 1.500 transiciones y 50 replays sin duplicados, errores
ni DLQ. La carga descubrió conflictos `P2034` causados por `SERIALIZABLE` entre agregados distintos;
sync y clasificación ahora usan `READ COMMITTED`, advisory lock por pedido y cinco reintentos. Pasan
outbox 4/4, webhooks 5/5, sync 4/4, clasificación 4/4, carga 1/1, database 16/16 y `validate` 87/87.

## Trigesimoctava vertical: E9-H3A

Estado: `COMPLETADA`.

Objetivo: convertir la auditoría de seguridad local ya realizada manualmente en un gate reproducible
que falle cerrado ante secretos de alta confianza, artefactos sensibles versionados, dependencias
productivas vulnerables o configuración base insegura.

Requisitos:

- inspeccionar únicamente archivos rastreados por Git y reportar detector/ruta/línea, nunca el valor;
- detectar claves privadas y formatos de token GitHub/AWS/Shopify/Slack/Wompi de alta confianza;
- impedir `.env`, dumps, llaves, `.artifacts`, builds, coverage o Prisma generado rastreados;
- comprobar que `.env`/`.artifacts` están ignorados y que no existen lifecycle scripts de instalación;
- exigir versiones exactas de dependencias, package manager/lockfile y `--frozen-lockfile` en CI;
- ejecutar `pnpm audit --prod --audit-level high` y exigir cero high/critical;
- endurecer checkout CI sin credenciales persistentes y rechazar `pull_request_target`/refs flotantes;
- verificar Compose sin `latest`, modo privilegiado, docker socket ni puertos no-loopback;
- verificar CSP/headers web mínimos y ausencia de `unsafe-eval` en producción;
- generar reporte agregado ignorado, sin coincidencias ni secretos, y documentar límites abiertos;
- incluir comando raíz y gate CI antes de pruebas que usan credenciales locales generadas.

Archivos previstos: `scripts/verify-security-baseline.mjs`, scripts package/CI, endurecimiento checkout,
arquitectura/testing/runbook/seguridad y registros maestros.

Dependencias: Git, Node/pnpm, lockfile, manifiestos JSON, Compose/Next config y acceso al advisory DB de
pnpm. No requiere credenciales, proveedor real, cambio de esquema ni tráfico a integraciones.

Pruebas requeridas: escáner con cero hallazgos, rutas prohibidas/ignore, versiones/lifecycle, audit
productivo, CI/Compose/headers, reporte redactado, `security:verify`, `pnpm audit --prod`, web gate y
regresión completa `pnpm validate`.

Riesgos conocidos: falsos positivos/negativos del escáner propio, advisory DB no disponible, acción
GitHub referenciada por tag mutable, CSP con `unsafe-inline`, ausencia de SAST/DAST/pentest y falsa
sensación de aprobación productiva. Mitigación: patrones de alta confianza, fallo cerrado de red,
controles explícitos, riesgos abiertos y alcance declarado como baseline local, no pentest.

Resultado: `security:verify` auto-prueba siete detectores y audita 443 archivos candidatos, tres
manifests, versiones/lifecycle, ignore, CI, cuatro imágenes Compose, bindings, secretos obligatorios,
CSP/headers y 402 dependencias productivas. Reporta cero secretos high-confidence, artefactos
prohibidos o vulnerabilidades high/critical; checkout ya usa `persist-credentials: false`. Pasan
`security:verify`, `web:verify` 13/13 y `pnpm validate` 87/87. Tags por versión, CSP inline,
SAST/DAST/pentest/TLS/infra objetivo permanecen explícitamente abiertos.

## Trigesimonovena vertical: E9-H4A

Estado: `COMPLETADA`.

Objetivo: demostrar que los artefactos productivos locales construyen, aplican migraciones como no-op,
inician API/web con configuración production fail-closed, responden health/readiness/headers y se
detienen sin dejar procesos/puertos. Formalizar rollback compatible con migraciones forward-only.

Requisitos:

- comando autónomo que construya ambos artefactos y levante dependencias locales saludables;
- `prisma migrate deploy` dos veces, donde la segunda sea no-op y el esquema permanezca actualizado;
- API compilada iniciada directamente con puerto aleatorio, production y métricas Bearer;
- liveness/readiness 200 con PostgreSQL/Redis/MinIO sanos;
- `/metrics` rechazado sin Bearer y disponible con token técnico efímero;
- Next productivo iniciado directamente con puerto aleatorio, origen/API/clave de referencia explícitos;
- homepage y BFF no autenticado esperados; CSP, COOP, Permissions, Referrer, nosniff y DENY presentes;
- CSP productiva sin `unsafe-eval`, sin `X-Powered-By` y respuestas API/BFF seguras;
- shutdown SIGTERM acotado y comprobación de que ambos puertos dejan de responder;
- reporte agregado ignorado, sin puertos, token, body, logs, PII o secretos;
- runbook de contención/rollback: kill switches, código compatible, migraciones sin down y restore solo
  ante incidente de datos; despliegue/rollback real requieren autorización humana.

Archivos previstos: `scripts/verify-release-smoke.mjs`, package/CI, arquitectura, testing, runbook de
release/rollback y registros maestros.

Dependencias: builds E0-H1, Compose E0-H2, readiness E0-H3, migraciones forward-only E0-H4A, headers
E6-H3A y `.env` local generado. No requiere credenciales reales ni infraestructura productiva.

Pruebas requeridas: build API/web, migración/reaplicación, procesos vivos, health/readiness/métricas,
headers productivos/BFF 401, shutdown/puertos cerrados, cleanup ante fallo, reporte redactado,
`release:smoke`, `database:status`, `security:verify` y `pnpm validate`.

Riesgos conocidos: puertos ocupados, proceso hijo huérfano, salida con secretos, migración incompatible
con rollback de código, confundir smoke local con deploy y diferencias de proxy/TLS. Mitigación: puertos
efímeros, procesos directos/finally, reporte agregado, expand/contract, compatibilidad explícita y
alcance local sin despliegue.

Resultado: completada el 2026-07-18. `release:smoke` construye ambos paquetes, aplica 32 migraciones
dos veces sin drift, inicia API y Next productivos, valida health/readiness/métricas/BFF/headers y
cierra ambos puertos. Última medición: API 3.278 ms y web 1.012 ms. El primer intento
detectó que Next arrancaba desde la raíz; se corrigió su `cwd` a `apps/web`. El reporte queda ignorado
y redactado. El rollback documentado es forward-compatible; no se desplegó, restauró ni autorizó
release.

## Cuadragesima vertical: E9-H5A

Estado: `COMPLETADA`.

Objetivo: convertir la verificación local de observabilidad en un drill autónomo, medido y fail-closed
de detección/recuperación, sin presentar sus umbrales como SLO productivos.

Requisitos:

- construir la API e iniciar Compose saludable desde el propio comando;
- asignar puerto API y credenciales técnicas efímeras para evitar colisiones/valores reutilizables;
- medir Redis down -> readiness 503 -> alerta firing única y Redis up -> readiness 200 -> resolved;
- exigir presupuestos locales conservadores de 15 s para detección y 30 s para recuperación;
- demostrar que una caída del Collector no cambia liveness ni termina la API y que exportación vuelve;
- conservar propagación W3C, correlación logs/spans, métricas Bearer y redacción existentes;
- garantizar cleanup/restauración de servicios y proceso API ante éxito o fallo;
- escribir reporte agregado ignorado sin puertos, tokens, IDs de traza, logs, URLs, PII o secretos;
- documentar métricas operativas, procedimiento de drill y límites frente a routing/SLO productivos.

Archivos previstos: `scripts/verify-observability.mjs`, package/CI si aplica, arquitectura, seguridad,
testing/runbook y registros maestros.

Dependencias: E0-H3B, E9-H3A y E9-H4A. No requiere credenciales ni infraestructura externas.

Pruebas requeridas: `observability:verify`, `security:verify`, `database:status`, `pnpm validate`,
cleanup de proceso y revisión del reporte redactado.

Riesgos conocidos: ruido de scheduling local, confundir tiempos Compose con SLO, alertas duplicadas,
backend caído que afecta negocio y reporte con identificadores sensibles. Mitigación: umbrales amplios
de gate, alcance local explícito, lifecycle exacto, fallos absorbidos y allowlist de campos del reporte.

Resultado: completada el 2026-07-18. El drill autónomo detectó readiness Redis down en 697 ms y
`firing` único en 978 ms; recuperó readiness en 6.322 ms, `resolved` en 6.325 ms y exportación OTLP en
4.185 ms. API sobrevivió, W3C/métricas/redacción pasaron, servicios se restauraron y el proceso cerró.
Reporte redactado; los presupuestos 15 s/30 s no se declaran SLO productivos.

## Cuadragesimoprimera vertical: E3-H8A

Estado: `COMPLETADA`.

Objetivo: purgar físicamente ciphertext y fingerprint de contenido inbound al vencer su fecha durable,
con scheduler fail-closed, concurrencia segura, auditoría atómica y evidencia tenant-safe.

Requisitos:

- migración expand-only que marque `content_purged_at` y permita solo transición irreversible de
  ciphertext presente a nulo después de `retention_expires_at`;
- conservar mensaje, relación, estado, timestamps, sender hash y evidencia redactada para operación;
- índice parcial para lotes vencidos y `FOR UPDATE SKIP LOCKED` con límite configurable;
- flags/kill switch cerrados por defecto, intervalo y lote acotados, sin ejecución solapada;
- auditoría por organización dentro de la misma transacción, sin IDs de mensajes ni contenido;
- métrica de resultado con etiquetas cerradas y ningún outbox/proveedor externo;
- probar vencido/no vencido, replay no-op, trigger contra borrado prematuro, auditoría, métrica y
  timeline que sigue mostrando `expired` sin intentar descifrar.

Archivos previstos: migración 31, schema/config, servicio/provider, métrica, integración WhatsApp,
arquitectura, seguridad, testing/runbook y registros maestros.

Dependencias: E3-H5A/H6A, fecha de retención ya asignada 1..365 días y keyring inbound. No define la
política legal ni habilita Meta real.

Pruebas requeridas: `whatsapp:verify`, `database:verify`, `security:verify` y `pnpm validate`.

Riesgos conocidos: purga anticipada, carrera entre schedulers, violar inmutabilidad, borrar evidencia o
filtrar conteos/IDs. Mitigación: condición DB por deadline, lock/skip-locked, trigger unidireccional,
soft purge de dos campos y auditoría agregada atómica.

Resultado: completada el 2026-07-18. La migración 31 permite exclusivamente la purga irreversible
posterior al deadline y añade índice parcial. Scheduler fail-closed usa lock, `SKIP LOCKED`, lote e
intervalo acotados; update y auditoría agregada son atómicos. `whatsapp:verify` pasa 26/26 con vigente
rechazado, vencido purgado, replay no-op, métrica y timeline seguro. No define política legal ni Meta.

## Cuadragesimosegunda vertical: E0-H4D

Estado: `COMPLETADA`.

Objetivo: cerrar TD-010 validando las seis constraints legacy de ownership/outbox que PostgreSQL ya
aplica a filas nuevas, después de demostrar que no existen filas históricas incompatibles.

Requisitos:

- comprobar cero organization/event nulos y cero referencias huérfanas antes de validar;
- migración forward-only con `VALIDATE CONSTRAINT`, sin drop/recreate ni reescritura de tablas;
- database gate debe exigir cero constraints no validadas y conservar todas las invariantes actuales;
- documentar impacto de lock y rollback forward-only; no borrar datos para hacer pasar la migración.

Archivos previstos: migración 32, pruebas/contrato DB y registros maestros.

Dependencias: migración E0-H4C y datos locales ya reforzados. No requiere proveedores externos.

Pruebas requeridas: preflight SQL, migración desde vacío/reaplicación, `database:verify`, backup/restore
y `pnpm validate`.

Riesgos conocidos: datos legacy inválidos o lock prolongado en una tabla grande. Mitigación: preflight
de nulos/huérfanos, enforcement ya activo para filas nuevas y ejecución aprobada en ventana real.

Resultado: completada el 2026-07-18. El preflight confirmó cero filas nulas/huérfanas; migración 32
validó las seis constraints sin reescritura ni borrado. El gate desde vacío exige 32 migraciones y cero
constraints no validadas en outbox/jobs.

## Cuadragesimotercera vertical: E1-H1B

Estado: `COMPLETADA_LOCALMENTE`.

Objetivo: dejar preparado el proveedor Shopify real sobre GraphQL Admin API 2026-07 sin degradar el
modo simulado ni permitir activaciones ambiguas.

Requisitos:

- seleccionar proveedor `simulation` o `live` exclusivamente desde el control global de Shopify;
- usar dominio canónico, `X-Shopify-Access-Token`, timeout y reintentos acotados para 429/5xx;
- consultar salud de tienda, pedido por GID y pedidos actualizados con paginación por cursor;
- probar durante health check los scopes efectivos de lectura de pedidos, inventario y ubicaciones;
- paginar line items en bloques de 250 y rechazar explícitamente pedidos que excedan el límite durable
  de 500, sin truncar montos o productos;
- transformar respuestas GraphQL al contrato normalizado sin presentar datos reales como fixtures;
- tratar errores GraphQL/user errors sin registrar token, payload sensible ni respuesta completa;
- exponer modo y versión API en resultados/auditoría y conservar fail-closed por flags/kill switch;
- pruebas contractuales sin red real para URL, headers, paginación, throttle, errores y redacción.

Archivos previstos: proveedor/cliente Shopify, normalizador, binding DI, configuración, pruebas,
contratos/arquitectura/seguridad/runbook y registros maestros.

Dependencias: E1-H1A/H3A y credenciales cifradas existentes. La validación contra una tienda real
seguirá bloqueada hasta recibir dominio/token de desarrollo autorizados.

Pruebas requeridas: unitarias del proveedor live, gates Shopify existentes, `security:verify` y
`pnpm validate`.

Riesgos conocidos: filtración de token/PII, versión API obsoleta, throttling, cursor inválido y confundir
contrato simulado con tráfico real. Mitigación: headers allowlist, errores redactados, versión explícita,
backoff/costo, cursores opacos y modo durable.

Resultado: proveedor GraphQL 2026-07 seleccionable por router, probe de orders/inventory/locations,
pedido y listado paginados, retry/redacción y límite explícito de 500 line items. Contratos locales
verdes; prueba contra tienda development bloqueada por credenciales.

## Cuadragesimocuarta vertical: E1-H2B

Estado: `COMPLETADA_LOCALMENTE`.

Objetivo: aceptar webhooks Shopify reales y administrar la suscripción `ORDERS_CREATE` con rotación
segura del secreto de firma.

Requisitos:

- verificar HMAC sobre bytes crudos con secreto activo y anterior durante una ventana acotada;
- distinguir payload live de fixture sintético y persistir solo evidencia redactada;
- exigir coherencia de modo entre integración, webhooks, sync y reconciliación cuando estén activos;
- registrar remotamente el webhook HTTPS de forma idempotente al activar una conexión live;
- conservar deduplicación por delivery ID/hash, límite de cuerpo, dominio y topic allowlist;
- no guardar ni registrar secreto, HMAC, dominio en claro o payload con PII.

Archivos previstos: ingreso webhook, cifrado/rotación, proveedor GraphQL, configuración, integración,
pruebas y documentación Shopify.

Dependencias: E1-H1B y una URL callback HTTPS. La entrega real seguirá sin ejecutarse sin credenciales.

Pruebas requeridas: unitarias de rotación/registro remoto, gate webhook existente, typecheck y seguridad.

Riesgos conocidos: corte durante rotación, suscripción duplicada, secreto equivocado y replay malicioso.
Mitigación: overlap 24 h configurable, consulta-before-create, HMAC constante y hash conflictivo.

Resultado: ingreso dual, rotación cifrada con secreto anterior/deadline y suscripción remota
consulta-before-create implementados. Entrega Shopify real bloqueada por credenciales/callback público.

## Cuadragesimoquinta vertical: E1-H4B

Estado: `COMPLETADA_LOCALMENTE`.

Objetivo: consumir de forma durable las acciones Shopify `MARK` y `CANCEL` solicitadas al vencer un
pago de transporte.

Requisitos:

- validar evento, tenant, tienda, pedido e intención expirada antes de cualquier efecto remoto;
- `MARK` añade una etiqueta determinista e idempotente al pedido Shopify;
- `CANCEL` requiere kill switch y habilitación destructiva independientes, sin reembolso automático;
- consultar cancelación previa y completar el job asíncrono antes de reflejar `CANCELLED` local;
- reintentos seguros: tag repetido no duplica y cancelación ya aplicada se reconoce como éxito;
- auditar resultado sin token, PII, payload remoto o texto de error de Shopify.

Archivos previstos: contrato/proveedor Shopify, consumidor, outbox worker/module, configuración,
métrica, pruebas y documentación.

Dependencias: E1-H1B y eventos de expiración E2-H6A. CANCEL live necesita decisión operativa explícita.

Pruebas requeridas: proveedor MARK/CANCEL, validación fail-closed, replay, gates outbox/Shopify y
typecheck.

Riesgos conocidos: cancelación irreversible, éxito remoto seguido de fallo local, evento forjado y
reembolso no deseado. Mitigación: doble gate, preconsulta remota, contrato tenant-safe, tags idempotentes
y `originalPaymentMethodsRefund=false`.

Resultado: consumidor outbox valida evento/tenant/política, ejecuta tag idempotente o cancelación
asíncrona sin refund y actualiza `CANCELLED` solo al completar. CANCEL queda cerrado por doble gate;
mutación development real bloqueada por credenciales y aprobación humana.

## Cuadragesimosexta vertical: E1-H5B

Estado: `COMPLETADA_LOCALMENTE`.

Objetivo: ejecutar reconciliación Shopify automática para todas las tiendas activas y drenar cada
ventana paginada sin intervención manual.

Requisitos:

- scheduler fail-closed con intervalo, lookback, lote de tiendas y máximo de páginas acotados;
- retomar exactamente la ventana/cursor durable si una ejecución quedó parcial;
- abrir una ventana nueva desde el checkpoint solo cuando el cursor anterior terminó;
- procesar tiendas de tenants distintos sin mezclar ownership ni credenciales;
- aislar fallo por tienda, conservar cursor para retry y emitir métricas/auditoría existentes;
- mantener endpoint manual para diagnóstico y permitir modo simulation/live coherente.

Archivos previstos: configuración, scheduler, reconciliación, módulo, pruebas y documentación.

Dependencias: E1-H5A y paginación E1-H1B. La prueba remota sigue bloqueada sin tienda development.

Pruebas requeridas: scheduler/cursor multi-página, gate reconciliation, typecheck, lint y Shopify suite.

Riesgos conocidos: loop infinito de cursor, solapamiento, starvation y ventana con huecos. Mitigación:
máximo de páginas, checkpoint por página, lote ordenado, intervalo y reanudación de ventana exacta.

Resultado: scheduler multi-tienda fail-closed abre ventanas acotadas, retoma cursor/ventana y drena
páginas hasta fin o safety limit. Gate local de reconciliación verde; rate limit live pendiente de tienda.

## Cuadragesimoséptima vertical: E0-H5D

Estado: `COMPLETADA`.

Objetivo: coordinar la revocación de una membresía con la liberación transaccional de todas sus
conversaciones WhatsApp asignadas, sin dejar ownership operativo en una identidad revocada.

Requisitos:

- bloquear la membresía y las conversaciones afectadas dentro de la misma transacción serializable;
- revocar la membresía, invalidar sus sesiones y liberar todas sus conversaciones como un único efecto;
- incrementar una vez la versión de cada conversación y conservar historial inmutable con razón cerrada
  `MEMBERSHIP_REVOKED` y el actor administrativo real;
- emitir un evento outbox por conversación y auditoría agregada sin contenido, PII ni IDs de mensajes;
- hacer replay idempotente sin nuevas versiones, historias o eventos;
- impedir que carreras de claim/reassign dejen una conversación asignada a la membresía revocada;
- mantener tenant isolation y la protección del último owner.

Archivos previstos: esquema/migración, administración de identidad, pruebas de integración, contratos,
arquitectura, seguridad, runbooks y registros maestros.

Dependencias: E0-H5C y E3-H7A. No requiere credenciales externas, Meta real ni habilitar asignaciones
WhatsApp en producción.

Pruebas requeridas: revocación con cero/una/múltiples conversaciones, replay, carrera, tenant,
historial/outbox/sesiones atómicos, `identity:verify`, `whatsapp:verify`, `database:verify`,
`security:verify` y `pnpm validate`.

Riesgos conocidos: deadlock por orden de locks, snapshot serializable obsoleto, transacción amplia y
evidencia con PII. Mitigación: lock advisory por tenant, filas ordenadas, retry de serialización,
operaciones bulk acotadas por las asignaciones existentes y metadata allowlist.

Resultado: la revocación libera en la misma transacción todas las conversaciones asignadas, incrementa
versiones, escribe historial `MEMBERSHIP_REVOKED`, outbox por conversación, auditoría agregada y revoca
sesiones. Identidad y asignaciones comparten un lock advisory por tenant; replay, carrera de claim y
tenant quedaron probados. Migración 33 amplía el enum/check sin relajar otras razones.

## Cuadragesimoctava vertical: E0-H3C

Estado: `COMPLETADA`.

Objetivo: reconstruir tras reinicio el estado de alertas de dependencias desde Alertmanager v2 para no
perder una transición activa ni duplicar firing/resolved por un baseline vacío.

Requisitos:

- consultar `GET /api/v2/alerts` con timeout y filtros activos antes de establecer el primer baseline;
- aceptar exclusivamente la alerta propia por labels cerradas `alertname`, `service` y `dependency`;
- conservar `startsAt` válido para resolver una alerta previa cuando la dependencia ya está sana;
- no emitir ni establecer baseline si la hidratación falla o devuelve un contrato inválido; reintentar;
- compartir una única hidratación entre observaciones concurrentes y limitar la respuesta procesada;
- mantener fallos de Alertmanager aislados de liveness/readiness y no registrar el payload remoto;
- probar reinicio con alerta activa up/down, respuesta inválida, retry y no duplicación.

Archivos previstos: servicio de alertas, prueba unitaria, arquitectura, seguridad/runbook y registros.

Dependencias: E0-H3B/E9-H5A y Alertmanager API v2 ya configurada. No selecciona backend productivo,
routing, TLS, retención ni SLO.

Pruebas requeridas: unitarias de hidratación/transición, `observability:verify`, `security:verify` y
`pnpm validate`.

Riesgos conocidos: confiar en alerta ajena, payload grande/malformado, consulta concurrente, duplicar
notificaciones o degradar readiness. Mitigación: allowlist exacta, máximo 1.000, parser defensivo,
promesa compartida, fail-closed y errores absorbidos.

Resultado: el primer readiness hidrata una única vez desde Alertmanager v2, adopta alertas activas o
resuelve las recuperadas conservando `startsAt`. Contrato inválido/timeout no establece baseline y se
reintenta. Seis pruebas unitarias y el drill real reiniciando la API con Redis down prueban que queda un
solo `firing` y un solo `resolved`, sin afectar readiness.

## Cuadragesimonovena vertical: E1-H5C

Estado: `COMPLETADA`.

Objetivo: añadir paginación keyset durable a la inspección especializada de incidencias de
reconciliación Shopify, cerrando TD-016 sin ampliar datos ni permisos.

Requisitos:

- ordenar por `firstDetectedAt DESC, id DESC` (timestamp inmutable) y pedir `limit + 1`;
- emitir cursor opaco con timestamp/UUID y ligarlo al filtro de estado;
- rechazar cursor inválido o reutilizado con otro filtro sin revelar contenido;
- conservar tenant/RBAC/no-store, límite 1..100 y proyección actual;
- probar páginas sin duplicados, cursor inválido, filtro cruzado e inserción concurrente.

Archivos previstos: controller/service Shopify reconciliation, prueba de integración, contrato/runbook,
deuda y registros maestros.

Dependencias: E1-H5A y endpoint de inspección existente. No requiere Shopify real ni migración.

Pruebas requeridas: `shopify:reconciliation:verify`, typecheck, lint y `pnpm validate`.

Riesgos conocidos: duplicar/omitir filas, ampliar tenant, cursor mutable o filtrar criterios internos.
Mitigación: keyset inmutable, fingerprint de filtro dentro del cursor, SQL tenant y mensajes genéricos.

Resultado: `GET /issues` usa `firstDetectedAt DESC, id DESC`, `limit + 1` y cursor base64url ligado al
estado. Cursor inválido/cruzado falla 400; inserciones posteriores no aparecen en páginas antiguas.
El gate pasa 6/6 entre integración y scheduler, sin migración ni cambios de permisos/proyección.

## Quincuagésima vertical: E0-H6A

Estado: `COMPLETADA`.

Objetivo: definir y automatizar fronteras modulares mínimas del API para cerrar TD-003 sin impedir las
colaboraciones legítimas ya demostradas por los flujos integrados.

Requisitos:

- inspeccionar el grafo real de imports antes de fijar reglas;
- separar raíces de composición, plataforma compartida y dominios funcionales;
- impedir que plataforma importe dominios y exigir allowlist exacta entre dominios;
- fallar ante módulos desconocidos, imports que escapan `src` y excepciones obsoletas;
- incluir fixtures allow/deny que demuestren que el gate detecta violaciones;
- integrar la verificación en `pnpm validate`/CI sin añadir dependencias.

Archivos previstos: script de arquitectura, package scripts, tipo compartido, documentación y
registros maestros.

Dependencias: E0-H1 y el grafo actual de `apps/api/src`. No requiere migración, infraestructura,
credenciales ni proveedor externo.

Pruebas requeridas: `architecture:verify`, fixtures permitidos/prohibidos, lint, typecheck, pruebas y
build mediante `pnpm validate`.

Riesgos conocidos: regex incompleto, allowlist demasiado amplia, bloquear composición legítima o
conservar excepciones históricas. Mitigación: specifiers literales cubiertos, pares exactos, roots
explícitos, módulos nuevos fail-closed, excepciones ejercidas y documentación del alcance.

Resultado: el gate revisa 123 archivos/529 imports, permite solo cinco colaboraciones dominio-dominio
exactas y prueba ocho fixtures allow/deny. Se eliminó el ciclo de tipos `observability -> health`
moviendo `DependencyStatus` a `foundation`; `architecture:verify` forma parte de `validate` y CI.

## Quincuagesimoprimera vertical: E7-H1A

Estado: `COMPLETADA`.

Objetivo: completar una base financiera local de solo lectura que resuma la cartera de intenciones
Wompi simuladas por estado y ventana, sin inventar costos, utilidad, contabilidad ni datos de proveedor.

Requisitos:

- ventana `[from,to)` obligatoria de máximo 31 días y consulta tenant-bounded sobre índice existente;
- totales y desglose por estados cerrados de PaymentIntent, moneda COP y modo simulation explícitos;
- dinero exacto sin conversión insegura de BIGINT a Number y conteos validados como safe integer;
- RBAC exclusivo owner/admin/finance, `no-store`, feature flag y kill switch fail-closed;
- auditoría y métricas acotadas sin importes, IDs de pedido, referencias ni PII;
- pruebas de RBAC/tenant, resultado, vacío, límites, controles, auditoría y exactitud monetaria.

Archivos previstos: servicio/controller/test financiero, contrato/arquitectura/seguridad/runbook,
testing y registros maestros.

Dependencias: E2-H2A..H6A y rol FINANCE existentes. Costos/rentabilidad, proveedor real y decisiones
contables permanecen bloqueados y fuera de esta vertical.

Pruebas requeridas: `finance:verify`, `architecture:verify`, lint, typecheck, regresión y build mediante
`pnpm validate`.

Riesgos conocidos: overflow monetario, mezcla de tenant, interpretar intención como recaudo, scans por
rango amplio y exponer cifras en telemetría. Mitigación: decimal string, SQL tenant, semántica
`portfolio`, rango 31 días, índice `(organization_id, created_at, id)` y metadata allowlist.

Resultado: endpoint read-only agrega una sola vez cartera Wompi/COP simulada por estado y total,
preserva BIGINT como decimal string, valida conteos y aplica RBAC/tenant/no-store/controles. El gate
PostgreSQL/HTTP pasa 4/4 con importe superior a MAX_SAFE_INTEGER, vacío, límites, auditoría y kill
switch. No calcula ingresos, costos ni rentabilidad.
