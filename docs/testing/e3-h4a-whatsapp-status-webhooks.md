# Evidencia E3-H4A — estados WhatsApp simulados

La vertical cubre fixture/contrato v1, HMAC sobre cuerpo crudo, secreto cifrado separado, RBAC,
tenant, firma inválida, replay, colisión, mensaje desconocido, carrera `sent`/`delivered`, evento
tardío, terminal inmutable, kill switch, redacción, historial, outbox, auditoría y métricas.

Comandos de evidencia específica:

```text
pnpm whatsapp:verify  # 14/14
pnpm database:verify  # 14/14, 23 migraciones, cero drift
pnpm validate         # 19 archivos, 66 pruebas, lint/types/builds verdes
```

No se usaron credenciales, mensajes, números ni PII reales y no hubo tráfico Meta. La suite usa una
base temporal aleatoria y elimina solo ese recurso al terminar.

Las migraciones 22/23 también se aplicaron sobre la base persistente local: `database:status`
confirmó 23/23. Todas las regresiones dedicadas, observabilidad e infraestructura quedaron verdes;
`pnpm audit --prod` permanece bloqueado por HTTP 410 del endpoint npm retirado.
