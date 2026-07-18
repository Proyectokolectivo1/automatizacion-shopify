# Evidencia E9-H5A: observabilidad y recuperación local

Fecha: 2026-07-18.

| Señal                         | Resultado | Presupuesto local |
| ----------------------------- | --------: | ----------------: |
| Readiness detecta Redis down  |    692 ms |         15.000 ms |
| Alerta única `firing`         |    972 ms |         15.000 ms |
| Reinicio conserva un firing   |         1 |    sin duplicados |
| Readiness vuelve a 200        |  6.265 ms |         30.000 ms |
| Alerta `resolved`             |  6.534 ms |         30.000 ms |
| Nueva traza tras Collector up |  3.693 ms |         30.000 ms |

`pnpm observability:verify` también confirmó correlación W3C/log, métricas protegidas, ausencia de
PII/token en logs, hidratación desde Alertmanager tras reinicio, supervivencia de API ante caída OTLP,
lifecycle sin duplicados, cierre del proceso y restauración de Redis/Collector. Runtime medido:
24.973 ms.

No existe todavía backend persistente de trazas, routing externo, retención/SLO aprobados ni
despliegue. El reporte local ignorado no contiene puertos, URLs, IDs, logs o credenciales.
