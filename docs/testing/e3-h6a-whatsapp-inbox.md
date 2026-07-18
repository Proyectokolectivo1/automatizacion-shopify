# Evidencia E3-H6A — bandeja WhatsApp simulada

La vertical cubre listado y timeline keyset, filtros, cursor inválido, identidad conocida/desconocida,
direcciones inbound/outbound, historial de estados, descifrado autorizado, contenido vencido, RBAC,
tenant no revelador, kill switch, `no-store`, auditoría sin PII y métrica acotada.

```text
pnpm whatsapp:verify  # 21/21
pnpm database:verify  # 14/14, 26 migraciones, cero drift
pnpm validate         # 20 archivos, 69 pruebas, cobertura crítica 100 %, lint/types/builds verdes
```

No se añadieron migraciones: la bandeja proyecta las conversaciones, mensajes e historial ya
durables. No se usaron PII o credenciales reales ni hubo tráfico Meta. El primer intento del gate
falló antes de ejecutar casos porque Docker/PostgreSQL estaban apagados; tras levantar la
infraestructura conservando volúmenes, 21/21 pasaron.
