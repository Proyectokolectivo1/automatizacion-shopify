# Ecommerce Inteligente

Monorepo de la plataforma interna Shopify + Wompi + Mastershop + WhatsApp + impresión + BI.

## Requisitos

- Node.js 22.23.1 LTS
- pnpm 10.25.0
- Docker Engine y Docker Compose (se usarán desde E0-H2)

## Inicio rápido

```bash
pnpm install --frozen-lockfile
pnpm infra:bootstrap
pnpm infra:verify
pnpm validate
pnpm dev
```

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/health`

Copie `.env.example` a un archivo local no versionado cuando necesite cambiar valores. Nunca incluya
credenciales reales en Git.

La infraestructura local publica PostgreSQL, Redis y MinIO solo en `127.0.0.1`. Consulte
`docs/runbooks/local-infrastructure.md` antes de operar o solucionar fallos. No use el contenedor
comunitario MinIO de desarrollo en producción.

## Estado real

Consulte [PROJECT_STATUS.md](PROJECT_STATUS.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) y
[TEST_REPORT.md](TEST_REPORT.md). La existencia de estructura o diagramas no implica que una
integración esté implementada.
