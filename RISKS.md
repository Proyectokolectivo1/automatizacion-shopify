# Registro de riesgos

Actualizado: 2026-07-12

| ID    | Riesgo                                                       | Prob. | Impacto | Mitigación                                                                             | Estado   |
| ----- | ------------------------------------------------------------ | ----- | ------- | -------------------------------------------------------------------------------------- | -------- |
| R-001 | Prompt maestro ausente puede contener requisitos adicionales | Alta  | Alto    | Prompt recibido, leído y reconciliado con el estado del proyecto                       | Cerrado  |
| R-002 | Mastershop sin contrato/sandbox                              | Alta  | Crítico | Interfaz, mock, fixtures, contrato, flag, simulación y kill switch; no activar real    | Abierto  |
| R-003 | Credenciales sandbox no disponibles                          | Alta  | Alto    | Adaptadores simulados y pruebas de contrato; bloquear efectos reales                   | Abierto  |
| R-004 | Una VM es punto único de fallo                               | Alta  | Alto    | Backups externos, restore probado, health checks y runbooks                            | Abierto  |
| R-005 | USD 35/mes insuficiente para todos los servicios             | Alta  | Alto    | Presupuesto desglosado y telemetría de costos antes del piloto                         | Abierto  |
| R-006 | Impresión no universal                                       | Alta  | Alto    | Matriz por impresora/driver/papel y piloto observado                                   | Abierto  |
| R-007 | Retención de 10 años eleva costo y exposición                | Media | Alto    | Política legal y almacenamiento escalonado                                             | Abierto  |
| R-008 | Parche Node local distinto a CI                              | Alta  | Medio   | `.nvmrc`, engines y actualización local documentada                                    | Abierto  |
| R-009 | MinIO comunitario archivado y afectado por CVE-2026-33322    | Alta  | Alto    | Solo localhost, sin OIDC, desarrollo; prohibir producción y decidir AIStor/alternativa | Abierto  |
| R-010 | Puertos estándar ocupados por otra infraestructura local     | Alta  | Bajo    | Puertos host alternos configurables; no detener procesos ajenos                        | Mitigado |
