# Seguridad del baseline E9-H3A

- El escáner se limita a patrones de alta confianza para reducir exposición y falsos positivos.
- Ninguna coincidencia, token, línea fuente o advisory se escribe en el reporte persistente.
- `.env`, `.artifacts`, dumps, llaves, builds, coverage y Prisma generado no pueden entrar al commit.
- Dependencias directas usan versiones exactas; CI instala exclusivamente el lockfile.
- No se permiten lifecycle scripts de instalación en los manifests del workspace.
- Checkout CI usa `contents: read` y `persist-credentials: false`.
- Compose no usa `latest`, privileged/host network/docker socket ni puertos fuera de loopback.
- El audit remoto falla cerrado si pnpm no puede consultar o devuelve high/critical.

Limitaciones abiertas: regex propias no cubren todo formato/entropía, tags de Actions no son SHA
inmutables, CSP conserva `unsafe-inline`, no existe secret manager/TLS/infra productiva y no se ejecuta
SAST/DAST/pentest. Un resultado verde no autoriza despliegue.
