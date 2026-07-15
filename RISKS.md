# Registro de riesgos

Actualizado: 2026-07-14

| ID    | Riesgo                                                      | Prob. | Impacto | Mitigación                                                         | Estado   |
| ----- | ----------------------------------------------------------- | ----- | ------- | ------------------------------------------------------------------ | -------- |
| R-001 | Prompt maestro ausente                                      | Alta  | Alto    | Prompt recibido, leído y reconciliado                              | Cerrado  |
| R-002 | Mastershop sin contrato/sandbox                             | Alta  | Crítico | Adaptador, mock, contrato, flag, simulación y kill switch          | Abierto  |
| R-003 | Credenciales sandbox no disponibles                         | Alta  | Alto    | Adaptadores simulados y pruebas de contrato                        | Abierto  |
| R-004 | Una VM es punto único de fallo                              | Alta  | Alto    | Backups externos, restore probado, checks y runbooks               | Abierto  |
| R-005 | USD 35/mes insuficiente                                     | Alta  | Alto    | Presupuesto y telemetría de costos antes del piloto                | Abierto  |
| R-006 | Impresión no universal                                      | Alta  | Alto    | Matriz por impresora/driver/papel y piloto                         | Abierto  |
| R-007 | Retención de 10 años eleva costo/exposición                 | Media | Alto    | Política legal y almacenamiento escalonado                         | Abierto  |
| R-008 | Parche Node local distinto a CI                             | Alta  | Medio   | `.nvmrc`, engines y actualización local                            | Abierto  |
| R-009 | MinIO comunitario archivado y con riesgo conocido           | Alta  | Alto    | Solo desarrollo localhost; sustituir antes de piloto               | Abierto  |
| R-010 | Puertos estándar ocupados                                   | Alta  | Bajo    | Puertos host alternos; no detener procesos ajenos                  | Mitigado |
| R-011 | `/metrics` carece de autenticación propia                   | Media | Alto    | API en localhost; restringir por red/proxy antes de despliegue     | Abierto  |
| R-012 | Sin trazas distribuidas ni alertas conectadas               | Media | Medio   | Entregar OpenTelemetry y reglas verificables en E0-H3B             | Abierto  |
| R-013 | Drift entre schema Prisma y constraints SQL                 | Media | Alto    | `migrate diff` contra una base temporal migrada en CI              | Mitigado |
| R-014 | Rollback destructivo de la migración inicial                | Baja  | Alto    | Expand-only, detener escritores y corregir hacia adelante          | Mitigado |
| R-015 | Retirar jobs demasiado pronto rompe deduplicación           | Media | Alto    | Retención BullMQ acotada y consumidor idempotente                  | Mitigado |
| R-016 | DLQ crece sin reproceso operativo auditado                  | Media | Alto    | API E0-H4C, auditoría, métricas, paginación y runbook              | Mitigado |
| R-017 | IP de cliente incorrecta detrás de proxy                    | Media | Alto    | Configurar proxy confiable y probar rate limit antes de piloto     | Abierto  |
| R-018 | UI futura almacena Bearer token de forma insegura           | Media | Alto    | Prohibir localStorage; decidir cookie/CSRF antes de la UI          | Abierto  |
| R-019 | No existe bootstrap operativo del primer owner              | Media | Alto    | Comando local, lock, secreto efímero, auditoría y runbook E0-H5C   | Mitigado |
| R-020 | Tokens consumidos/vencidos crecen sin retención             | Media | Medio   | Definir política y job de purga tras decisión legal DP-003         | Abierto  |
| R-021 | Filas legacy sin ownership bloquean operación DLQ           | Baja  | Alto    | Backfill, checks NOT VALID y consulta previa a validación final    | Mitigado |
| R-022 | Tokens Shopify pueden filtrarse o quedar sin rotar          | Media | Crítico | Cifrado versionado, redacción, rotación y mock antes de conectar   | Abierto  |
| R-023 | PAT de GitHub expuesto en la conversación                   | Alta  | Crítico | No usarlo; revocarlo y conservar OAuth seguro en keyring           | Abierto  |
| R-024 | Pérdida de una versión del keyring hace ilegibles tokens    | Baja  | Crítico | Rotación por fases, backup del secret manager y runbook            | Abierto  |
| R-025 | Mock Shopify confundido con conexión productiva             | Media | Alto    | `mode=simulation`, fixture versionado, flags y fail-closed         | Mitigado |
| R-026 | Rotar el secreto webhook invalida entregas en tránsito      | Media | Alto    | Diseñar solapamiento de claves antes del registro remoto           | Abierto  |
| R-027 | Payload webhook contiene PII o crece sin control            | Media | Crítico | Límite 256 KiB, hash/resumen redactado y no persistir cuerpo       | Mitigado |
| R-028 | Reentregas Shopify duplican efectos o chocan por ID         | Alta  | Alto    | Unique store/topic/ID, hash de cuerpo y conflicto fail-closed      | Mitigado |
| R-029 | Un snapshot tardío sobrescribe información más reciente     | Alta  | Alto    | Lock serializable y comparación estricta de `source_updated_at`    | Mitigado |
| R-030 | PII real queda retenida sin política aprobada               | Media | Crítico | Solo fixture sintético; bloquear real hasta resolver DP-003        | Abierto  |
| R-031 | Política comercial errónea clasifica pedidos indebidamente  | Media | Crítico | Versionado, prioridad, fail-closed, simulación y aprobación previa | Abierto  |
| R-032 | Ventana/cursor incorrectos generan falsos faltantes         | Media | Alto    | Ventana máxima, checkpoint durable, dedupe, simulación y auditoría | Mitigado |
| R-033 | Reproceso concurrente duplica pedidos o entregas            | Alta  | Alto    | Locks, transacción serializable, idempotencia y outbox versionado  | Mitigado |
| R-034 | Una tarifa comercial incorrecta cobra transporte indebido   | Media | Crítico | Versionado, preview, fail-closed, auditoría y aprobación humana    | Abierto  |
| R-035 | Confundir llaves/firmas Wompi entre ambientes               | Media | Crítico | Secretos separados, prefijos, sandbox primero, flags y kill switch | Abierto  |
| R-036 | El contrato oficial Wompi cambia antes de conectar          | Media | Alto    | Fijar fixtures, reconfirmar docs y ejecutar contrato en sandbox    | Abierto  |
| R-037 | Un checkout simulado se confunde con un cobro real          | Media | Crítico | Dominio `.invalid`, modo explícito, kill switch y pruebas          | Mitigado |
| R-038 | Webhook firmado comunica monto/estado distinto al proveedor | Alta  | Crítico | Consulta authoritative y comparación total antes de actualizar     | Mitigado |
