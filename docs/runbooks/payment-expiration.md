# Runbook de vencimiento de pagos

## Activación simulada

1. Mantenga `PAYMENT_EXPIRATION_SIMULATION_MODE=true`.
2. Configure `PAYMENT_EXPIRATION_DEFAULT_ACTION=MARK` salvo decisión operativa aprobada.
3. Habilite `PAYMENT_EXPIRATION_ENABLED=true`.
4. Desactive `PAYMENT_EXPIRATION_KILL_SWITCH=false`.
5. Verifique métricas con `action=expiration`, outbox, auditoría e historial.

`CANCEL` no cancela Shopify: solo registra una solicitud simulada. No habilite un consumidor externo
sin credenciales, contrato, pruebas de sandbox y aprobación humana.

## Incidentes

- Vencimientos inesperados: active el kill switch y conserve la evidencia; no revierta filas a mano.
- Pago aprobado tardío: localice `payment.intent.late-status-observed.v1` y el pedido
  `MANUAL_REVIEW`; confirme Wompi authoritative antes de una acción manual.
- Scheduler detenido: revise flags, proceso API y métricas. El siguiente ciclo reclama filas vencidas
  con seguridad; no requiere adelantar `expires_at`.
- Backlog alto: reduzca el intervalo o aumente el batch dentro de los límites validados; vigile locks.

## Verificación

Ejecute `pnpm wompi:verify`, `pnpm database:verify` y `pnpm outbox:verify`. El rollback operativo es el
kill switch; cualquier compensación de estados requiere autorización.
