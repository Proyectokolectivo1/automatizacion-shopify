# Contrato de proveedor Wompi Colombia

Estado: `BLOQUEADO_POR_CREDENCIALES`. La documentación oficial permite definir el adaptador y las
pruebas contractuales, pero no autoriza transacciones reales.

## Frontera confirmada

- Sandbox: `https://sandbox.wompi.co/v1`; producción: `https://production.wompi.co/v1`.
- Llaves pública, privada, de eventos y de integridad son diferentes y específicas por ambiente.
- Crear transacción usa `POST /v1/transactions`, Bearer con llave privada, referencia única de hasta
  255 caracteres, importe entero en centavos, moneda COP, token de aceptación y firma de integridad.
- Consultar usa `GET /v1/transactions/:id`; estados: `PENDING`, `APPROVED`, `DECLINED`, `VOIDED` y
  `ERROR`.
- Los eventos HTTP se validan con SHA-256 usando `signature.properties`, `timestamp` y secreto de
  eventos, y deben responder 200 solo después de aceptación durable.
- El checkout alojado firma referencia + importe + moneda, y expiración cuando exista, con el secreto
  de integridad. La plataforma nunca debe capturar datos de tarjeta.

Fuentes oficiales: [ambientes y llaves](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/),
[transacciones](https://docs.wompi.co/docs/colombia/transacciones/),
[eventos](https://docs.wompi.co/docs/colombia/eventos/) y
[Widget/checkout web](https://docs.wompi.co/docs/colombia/widget-checkout-web/).

## Controles obligatorios del futuro adaptador

Interfaz real + simulador determinista + fixtures versionados + pruebas de contrato, timeout,
reintentos solo seguros, idempotencia local, redacción, métricas acotadas, flag, modo simulación y
kill switch. Sandbox debe preceder a producción. Faltan llaves sandbox, comercio/configuración de
aceptación, URLs públicas de eventos y aprobación para crear transacciones.
