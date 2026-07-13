# Registro de riesgos

Actualizado: 2026-07-12

| ID    | Riesgo                                            | Prob. | Impacto | Mitigación                                                     | Estado   |
| ----- | ------------------------------------------------- | ----- | ------- | -------------------------------------------------------------- | -------- |
| R-001 | Prompt maestro ausente                            | Alta  | Alto    | Prompt recibido, leído y reconciliado                          | Cerrado  |
| R-002 | Mastershop sin contrato/sandbox                   | Alta  | Crítico | Adaptador, mock, contrato, flag, simulación y kill switch      | Abierto  |
| R-003 | Credenciales sandbox no disponibles               | Alta  | Alto    | Adaptadores simulados y pruebas de contrato                    | Abierto  |
| R-004 | Una VM es punto único de fallo                    | Alta  | Alto    | Backups externos, restore probado, checks y runbooks           | Abierto  |
| R-005 | USD 35/mes insuficiente                           | Alta  | Alto    | Presupuesto y telemetría de costos antes del piloto            | Abierto  |
| R-006 | Impresión no universal                            | Alta  | Alto    | Matriz por impresora/driver/papel y piloto                     | Abierto  |
| R-007 | Retención de 10 años eleva costo/exposición       | Media | Alto    | Política legal y almacenamiento escalonado                     | Abierto  |
| R-008 | Parche Node local distinto a CI                   | Alta  | Medio   | `.nvmrc`, engines y actualización local                        | Abierto  |
| R-009 | MinIO comunitario archivado y con riesgo conocido | Alta  | Alto    | Solo desarrollo localhost; sustituir antes de piloto           | Abierto  |
| R-010 | Puertos estándar ocupados                         | Alta  | Bajo    | Puertos host alternos; no detener procesos ajenos              | Mitigado |
| R-011 | `/metrics` carece de autenticación propia         | Media | Alto    | API en localhost; restringir por red/proxy antes de despliegue | Abierto  |
| R-012 | Sin trazas distribuidas ni alertas conectadas     | Media | Medio   | Entregar OpenTelemetry y reglas verificables en E0-H3B         | Abierto  |
