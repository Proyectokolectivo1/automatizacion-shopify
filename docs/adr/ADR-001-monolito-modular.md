# ADR-001: Monolito modular en monorepo

- Estado: Aceptada
- Fecha: 2026-07-12

## Contexto

La plataforma debe coordinar pedidos, pagos, logística, mensajería, impresión y analítica con
consistencia transaccional, un presupuesto inicial reducido y un volumen mínimo de 500 pedidos por
día. Separar servicios desde el inicio aumentaría la superficie operativa y dificultaría las
transacciones y el diagnóstico.

## Decisión

Se implementará un monolito modular TypeScript en un monorepo pnpm/Turborepo. La API NestJS será el
límite HTTP, los módulos de dominio no dependerán de SDK externos y los workers se ejecutarán como
procesos separados dentro del mismo repositorio. PostgreSQL será la fuente transaccional y el patrón
Transactional Outbox conectará las transacciones con BullMQ.

## Consecuencias

- Los módulos compartirán despliegue y versionado durante el MVP.
- Las fronteras se impondrán mediante paquetes, contratos y reglas de dependencias.
- Los workers podrán escalar por proceso sin introducir microservicios.
- Una separación futura exigirá otro ADR y evidencia de que el monolito dejó de ser suficiente.

## Reversibilidad

Los adaptadores y eventos versionados permiten extraer un módulo en el futuro sin cambiar primero el
dominio. No se autoriza esa extracción durante el MVP.
