# Evidencia E9-H4A: smoke local de release

Fecha: 2026-07-18.

## Resultado

`pnpm release:smoke` construyó ambos paquetes, reaplicó 32 migraciones sin cambios y arrancó los
artefactos productivos locales. En el cierre con 32 migraciones, la API estuvo lista en 3.278 ms y
Next.js en 1.012 ms.

Se comprobaron:

- liveness y readiness de API con PostgreSQL, Redis y MinIO saludables;
- métricas 401 sin Bearer y 200 con token efímero;
- homepage, CSP sin `unsafe-eval`, cabeceras defensivas y ausencia de `X-Powered-By`;
- BFF sin sesión 401 y `no-store`;
- `SIGTERM`, salida acotada y cierre efectivo de ambos puertos;
- reporte agregado ignorado sin puertos, bodies, logs, PII ni secretos.

## Incidencia corregida

La primera ejecución inició correctamente la API pero Next terminó antes de servir. El diagnóstico
mostró que `next start` buscaba `.next` desde la raíz del monorepo. El launcher ahora conserva el
binario absoluto y usa `apps/web` como directorio de trabajo; el gate completo pasó al repetir.

## Límites

No hubo despliegue, TLS/proxy, tráfico real, rollback real ni aprobación de release. El runbook exige
compatibilidad forward-only y reserva restore para incidentes de datos autorizados.
