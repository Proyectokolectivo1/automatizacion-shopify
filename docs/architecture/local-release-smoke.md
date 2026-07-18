# Smoke local de artefactos de release

## Alcance

E9-H4A demuestra que los artefactos construidos para producción pueden arrancar y detenerse en el
entorno Compose local. No despliega, no prueba TLS/proxy y no aprueba un release.

## Flujo verificable

1. `pnpm build` genera API y Next.js en modo optimizado.
2. `release:smoke` inicia PostgreSQL, Redis y MinIO y espera sus health checks.
3. `prisma migrate deploy` se ejecuta dos veces; la segunda aplicación debe ser no-op y
   `migrate status` debe quedar actualizado.
4. La API compilada arranca directamente con `NODE_ENV=production`, puerto efímero y Bearer técnico
   generado solo en memoria.
5. Se prueban liveness, readiness contra las tres dependencias y métricas cerradas/permitidas.
6. Next.js arranca desde su artefacto productivo en otro puerto efímero. Se prueban homepage,
   cabeceras, CSP productiva y BFF sin sesión.
7. Ambos procesos reciben `SIGTERM`; el gate confirma que sus puertos dejan de aceptar conexiones.

## Fronteras de seguridad

- Los puertos se asignan dinámicamente y no se escriben en el reporte.
- El token de métricas y la clave de referencias existen solo en el proceso de verificación.
- El reporte contiene booleanos y duraciones agregadas; nunca bodies, logs, PII ni secretos.
- El bloque `finally` intenta detener ambos hijos aun cuando una comprobación falla.
- CSP productiva no contiene `unsafe-eval`; `X-Powered-By` permanece ausente.

## Limitaciones

El gate no cubre balanceador, certificados, DNS, secret manager, infraestructura objetivo, tráfico
real ni compatibilidad de una versión previamente desplegada. Estas validaciones deben repetirse en
el entorno aprobado antes de un piloto.
