# Registro de riesgos

Actualizado: 2026-07-17

| ID    | Riesgo                                                      | Prob. | Impacto | Mitigación                                                              | Estado   |
| ----- | ----------------------------------------------------------- | ----- | ------- | ----------------------------------------------------------------------- | -------- |
| R-001 | Prompt maestro ausente                                      | Alta  | Alto    | Prompt recibido, leído y reconciliado                                   | Cerrado  |
| R-002 | Mastershop sin contrato/sandbox                             | Alta  | Crítico | Adaptador, mock, contrato, flag, simulación y kill switch               | Abierto  |
| R-003 | Credenciales sandbox no disponibles                         | Alta  | Alto    | Adaptadores simulados y pruebas de contrato                             | Abierto  |
| R-004 | Una VM es punto único de fallo                              | Alta  | Alto    | Backups externos, restore probado, checks y runbooks                    | Abierto  |
| R-005 | USD 35/mes insuficiente                                     | Alta  | Alto    | Presupuesto y telemetría de costos antes del piloto                     | Abierto  |
| R-006 | Impresión no universal                                      | Alta  | Alto    | Matriz por impresora/driver/papel y piloto                              | Abierto  |
| R-007 | Retención de 10 años eleva costo/exposición                 | Media | Alto    | Política legal y almacenamiento escalonado                              | Abierto  |
| R-008 | Parche Node local distinto a CI                             | Alta  | Medio   | `.nvmrc`, engines y actualización local                                 | Abierto  |
| R-009 | MinIO comunitario archivado y con riesgo conocido           | Alta  | Alto    | Solo desarrollo localhost; sustituir antes de piloto                    | Abierto  |
| R-010 | Puertos estándar ocupados                                   | Alta  | Bajo    | Puertos host alternos; no detener procesos ajenos                       | Mitigado |
| R-011 | `/metrics` carece de autenticación propia                   | Media | Alto    | API en localhost; restringir por red/proxy antes de despliegue          | Abierto  |
| R-012 | Sin trazas distribuidas ni alertas conectadas               | Media | Medio   | Entregar OpenTelemetry y reglas verificables en E0-H3B                  | Abierto  |
| R-013 | Drift entre schema Prisma y constraints SQL                 | Media | Alto    | `migrate diff` contra una base temporal migrada en CI                   | Mitigado |
| R-014 | Rollback destructivo de la migración inicial                | Baja  | Alto    | Expand-only, detener escritores y corregir hacia adelante               | Mitigado |
| R-015 | Retirar jobs demasiado pronto rompe deduplicación           | Media | Alto    | Retención BullMQ acotada y consumidor idempotente                       | Mitigado |
| R-016 | DLQ crece sin reproceso operativo auditado                  | Media | Alto    | API E0-H4C, auditoría, métricas, paginación y runbook                   | Mitigado |
| R-017 | IP de cliente incorrecta detrás de proxy                    | Media | Alto    | Configurar proxy confiable y probar rate limit antes de piloto          | Abierto  |
| R-018 | UI futura almacena Bearer token de forma insegura           | Media | Alto    | Prohibir localStorage; decidir cookie/CSRF antes de la UI               | Abierto  |
| R-019 | No existe bootstrap operativo del primer owner              | Media | Alto    | Comando local, lock, secreto efímero, auditoría y runbook E0-H5C        | Mitigado |
| R-020 | Tokens consumidos/vencidos crecen sin retención             | Media | Medio   | Definir política y job de purga tras decisión legal DP-003              | Abierto  |
| R-021 | Filas legacy sin ownership bloquean operación DLQ           | Baja  | Alto    | Backfill, checks NOT VALID y consulta previa a validación final         | Mitigado |
| R-022 | Tokens Shopify pueden filtrarse o quedar sin rotar          | Media | Crítico | Cifrado versionado, redacción, rotación y mock antes de conectar        | Abierto  |
| R-023 | PAT de GitHub expuesto en la conversación                   | Alta  | Crítico | No usarlo; revocarlo y conservar OAuth seguro en keyring                | Abierto  |
| R-024 | Pérdida de una versión del keyring hace ilegibles tokens    | Baja  | Crítico | Rotación por fases, backup del secret manager y runbook                 | Abierto  |
| R-025 | Mock Shopify confundido con conexión productiva             | Media | Alto    | `mode=simulation`, fixture versionado, flags y fail-closed              | Mitigado |
| R-026 | Rotar el secreto webhook invalida entregas en tránsito      | Media | Alto    | Diseñar solapamiento de claves antes del registro remoto                | Abierto  |
| R-027 | Payload webhook contiene PII o crece sin control            | Media | Crítico | Límite 256 KiB, hash/resumen redactado y no persistir cuerpo            | Mitigado |
| R-028 | Reentregas Shopify duplican efectos o chocan por ID         | Alta  | Alto    | Unique store/topic/ID, hash de cuerpo y conflicto fail-closed           | Mitigado |
| R-029 | Un snapshot tardío sobrescribe información más reciente     | Alta  | Alto    | Lock serializable y comparación estricta de `source_updated_at`         | Mitigado |
| R-030 | PII real queda retenida sin política aprobada               | Media | Crítico | Solo fixture sintético; bloquear real hasta resolver DP-003             | Abierto  |
| R-031 | Política comercial errónea clasifica pedidos indebidamente  | Media | Crítico | Versionado, prioridad, fail-closed, simulación y aprobación previa      | Abierto  |
| R-032 | Ventana/cursor incorrectos generan falsos faltantes         | Media | Alto    | Ventana máxima, checkpoint durable, dedupe, simulación y auditoría      | Mitigado |
| R-033 | Reproceso concurrente duplica pedidos o entregas            | Alta  | Alto    | Locks, transacción serializable, idempotencia y outbox versionado       | Mitigado |
| R-034 | Una tarifa comercial incorrecta cobra transporte indebido   | Media | Crítico | Versionado, preview, fail-closed, auditoría y aprobación humana         | Abierto  |
| R-035 | Confundir llaves/firmas Wompi entre ambientes               | Media | Crítico | Secretos separados, prefijos, sandbox primero, flags y kill switch      | Abierto  |
| R-036 | El contrato oficial Wompi cambia antes de conectar          | Media | Alto    | Fijar fixtures, reconfirmar docs y ejecutar contrato en sandbox         | Abierto  |
| R-037 | Un checkout simulado se confunde con un cobro real          | Media | Crítico | Dominio `.invalid`, modo explícito, kill switch y pruebas               | Mitigado |
| R-038 | Webhook firmado comunica monto/estado distinto al proveedor | Alta  | Crítico | Consulta authoritative y comparación total antes de actualizar          | Mitigado |
| R-039 | Carrera del scheduler duplica recordatorios                 | Alta  | Alto    | Unique intent/secuencia, SKIP LOCKED, transacción y prueba concurrente  | Mitigado |
| R-040 | Pago aprobado posterior al vencimiento                      | Media | Crítico | Lock común, terminal inmutable, outbox y revisión manual                | Mitigado |
| R-041 | Confundir solicitud `CANCEL` con cancelación real           | Media | Alto    | Evento `requested`, modo simulado y no usar `CANCELLED`                 | Mitigado |
| R-042 | Conciliación parcial oculta diferencias financieras         | Media | Crítico | Transacción completa; checkpoint solo avanza en éxito; reporte fallido  | Mitigado |
| R-043 | Reinicio pierde el catálogo authoritative del mock Wompi    | Alta  | Medio   | Fallar cerrado, no avanzar ventana y migrar a sandbox/fixture durable   | Abierto  |
| R-044 | Un número WhatsApp enruta eventos a más de un tenant        | Baja  | Crítico | Índice parcial único, FK tenant, RBAC y lookup no revelador             | Mitigado |
| R-045 | Versión/scopes/errores Meta cambian antes de conectar       | Alta  | Alto    | Versión configurable y revalidación oficial/sandbox antes del adaptador | Abierto  |
| R-046 | Mock WhatsApp se confunde con canal real                    | Media | Crítico | `mode=simulation`, fixture v1, flags cerrados y kill switch             | Mitigado |
| R-047 | Aprobación local se interpreta como aprobación de Meta      | Media | Crítico | Estado `simulated_approved`, contrato y UI/API sin alias `approved`     | Mitigado |
| R-048 | Edición de plantilla cambia mensajes históricos             | Media | Alto    | Versiones inmutables, trigger SQL y `templateKey` lógico                | Mitigado |
| R-049 | Dos versiones atienden el mismo evento e idioma             | Media | Alto    | Lock serializable, swap atómico e índice único parcial                  | Mitigado |
| R-050 | Reintentos WhatsApp crean mensajes duplicados               | Alta  | Crítico | Idempotencia HTTP, clave de negocio, locks y unique constraint          | Mitigado |
| R-051 | PII del mensaje se filtra en telemetría o eventos           | Media | Crítico | Payloads acotados, redacción y pruebas negativas                        | Mitigado |
| R-052 | Aceptación simulada se confunde con entrega Meta            | Media | Crítico | Estado exclusivo, timestamps nulos, constraints, contrato y ADR-004     | Mitigado |
| R-053 | Eventos tardíos o carreras regresan un estado WhatsApp      | Alta  | Crítico | Lock, máquina monotónica, terminales inmutables e historial             | Mitigado |
| R-054 | Firma sintética se interpreta como autenticación oficial    | Media | Crítico | Nombre/versionado explícitos, flags, secreto separado y ADR-005         | Mitigado |
| R-055 | Texto inbound queda retenido después de su plazo            | Media | Crítico | Cifrado, vencimiento explícito y purga obligatoria antes de Meta real   | Abierto  |
| R-056 | Rotación de keyring parte la identidad seudónima            | Baja  | Alto    | Consultar versiones históricas y migrar el hash al recibir otro mensaje | Mitigado |
| R-057 | Payload inbound sintético se confunde con webhook Meta      | Media | Crítico | Fixture/IDs/header explícitos, schema estricto, flags y ADR-006         | Mitigado |
| R-058 | Bandeja filtra contenido por caché, log o rol amplio        | Media | Crítico | RBAC específico, no-store, selección mínima y pruebas negativas         | Mitigado |
| R-059 | Cursor mutable duplica/omite conversaciones en una página   | Media | Medio   | Orden keyset timestamp+UUID y cliente tolerante a cambios concurrentes  | Mitigado |
