'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import {
  dashboardPayloadSchema,
  OPERATIONAL_TYPES,
  organizationOptionsSchema,
  type DashboardPayload,
  type OperationalType,
  type OrganizationOption,
} from '../lib/contracts';

const errorSchema = z.object({ error: z.string() });
const selectionSchema = z.object({
  organizations: organizationOptionsSchema,
  selectionRequired: z.literal(true),
});
const TYPE_LABELS: Readonly<Record<OperationalType, string>> = {
  order: 'Pedidos',
  payment_intent: 'Intentos de pago',
  shopify_reconciliation_issue: 'Conciliación Shopify',
  whatsapp_conversation: 'Conversaciones WhatsApp',
  wompi_reconciliation_issue: 'Conciliación Wompi',
};

interface Filters {
  readonly from: string;
  readonly to: string;
  readonly type: '' | OperationalType;
}

function localDateTime(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function initialFilters(): Filters {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: localDateTime(from), to: localDateTime(to), type: '' };
}

function csrfToken(): string | undefined {
  const prefix = 'ei_csrf=';
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
  return entry === undefined ? undefined : decodeURIComponent(entry.slice(prefix.length));
}

async function readError(response: Response): Promise<string> {
  try {
    const parsed = errorSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.error : 'No fue posible completar la operación';
  } catch {
    return 'No fue posible completar la operación';
  }
}

async function sessionMutation(path: string, body?: unknown): Promise<Response> {
  const csrf = csrfToken();
  return fetch(path, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(csrf === undefined ? {} : { 'x-csrf-token': csrf }),
    },
    method: 'POST',
  });
}

export function DashboardApp() {
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [dashboard, setDashboard] = useState<DashboardPayload>();
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loginOptions, setLoginOptions] = useState<readonly OrganizationOption[]>([]);
  const [password, setPassword] = useState('');
  const [selectedLoginOrganization, setSelectedLoginOrganization] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState('');
  const [sessionState, setSessionState] = useState<'anonymous' | 'forbidden' | 'ready'>(
    'anonymous',
  );

  const loadDashboard = useCallback(
    async (cursor?: string, append = false, allowRefresh = true): Promise<void> => {
      setLoading(true);
      setError(undefined);
      const query = new URLSearchParams({
        from: new Date(appliedFilters.from).toISOString(),
        to: new Date(appliedFilters.to).toISOString(),
      });
      if (appliedFilters.type !== '') query.set('type', appliedFilters.type);
      if (cursor !== undefined) query.set('cursor', cursor);
      const response = await fetch(`/api/dashboard?${query}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (response.status === 401 && allowRefresh && csrfToken() !== undefined) {
        const refreshed = await sessionMutation('/api/session/refresh');
        if (refreshed.ok) {
          await loadDashboard(cursor, append, false);
          return;
        }
      }
      if (!response.ok) {
        setDashboard(undefined);
        setSessionState(response.status === 403 ? 'forbidden' : 'anonymous');
        setError(response.status === 401 ? undefined : await readError(response));
        setLoading(false);
        return;
      }
      const parsed = dashboardPayloadSchema.safeParse(await response.json());
      if (!parsed.success) {
        setDashboard(undefined);
        setError('El dashboard recibió una respuesta inválida');
        setLoading(false);
        return;
      }
      setDashboard((current) =>
        append && current !== undefined
          ? { ...parsed.data, queue: [...current.queue, ...parsed.data.queue] }
          : parsed.data,
      );
      setSelectedOrganization(parsed.data.currentOrganization.organizationId);
      setSessionState('ready');
      setLoading(false);
    },
    [appliedFilters],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    const response = await fetch('/api/session/login', {
      body: JSON.stringify({
        email,
        ...(selectedLoginOrganization === '' ? {} : { organizationId: selectedLoginOrganization }),
        password,
      }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (response.status === 409) {
      const parsed = selectionSchema.safeParse(await response.json());
      if (!parsed.success) setError('No fue posible cargar tus organizaciones');
      else {
        setLoginOptions(parsed.data.organizations);
        setSelectedLoginOrganization(parsed.data.organizations[0]?.organizationId ?? '');
      }
      setLoading(false);
      return;
    }
    if (!response.ok) {
      setError(await readError(response));
      setLoading(false);
      return;
    }
    setPassword('');
    setLoginOptions([]);
    setSelectedLoginOrganization('');
    await loadDashboard();
  }

  async function logout(): Promise<void> {
    setLoading(true);
    const response = await sessionMutation('/api/session/logout');
    if (!response.ok) {
      setError(await readError(response));
      setLoading(false);
      return;
    }
    setDashboard(undefined);
    setSessionState('anonymous');
    setLoading(false);
  }

  async function switchOrganization(): Promise<void> {
    if (selectedOrganization === dashboard?.currentOrganization.organizationId) return;
    setLoading(true);
    const response = await sessionMutation('/api/session/switch', {
      organizationId: selectedOrganization,
    });
    if (!response.ok) {
      setError(await readError(response));
      setLoading(false);
      return;
    }
    await loadDashboard();
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAppliedFilters(draftFilters);
  }

  if (sessionState !== 'ready' || dashboard === undefined) {
    return (
      <main className="login-shell">
        <section className="brand-panel" aria-labelledby="brand-title">
          <p className="eyebrow">Centro de operaciones</p>
          <h1 id="brand-title">Ecommerce Inteligente</h1>
          <p className="hero-copy">
            Una vista segura y enfocada para detectar lo que necesita atención en tus tiendas.
          </p>
          <div className="trust-note">
            <span aria-hidden="true">●</span> Sesión protegida · datos operativos mínimos
          </div>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <p className="eyebrow">Acceso interno</p>
          <h2 id="login-title">Inicia sesión</h2>
          <p className="muted">Usa las credenciales asignadas por el administrador.</p>
          {sessionState === 'forbidden' ? (
            <p className="notice error" role="alert">
              Tu rol actual no tiene acceso al dashboard operativo.
            </p>
          ) : null}
          {error !== undefined ? (
            <p className="notice error" role="alert">
              {error}
            </p>
          ) : null}
          <form className="form-stack" onSubmit={(event) => void submitLogin(event)}>
            <label>
              Correo
              <input
                autoComplete="username"
                maxLength={320}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Contraseña
              <input
                autoComplete="current-password"
                maxLength={128}
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {loginOptions.length > 1 ? (
              <fieldset>
                <legend>Organización</legend>
                {loginOptions.map((option) => (
                  <label className="organization-option" key={option.organizationId}>
                    <input
                      checked={selectedLoginOrganization === option.organizationId}
                      name="login-organization"
                      onChange={() => setSelectedLoginOrganization(option.organizationId)}
                      type="radio"
                    />
                    <span>
                      <strong>{option.name}</strong>
                      <small>{option.role}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? 'Verificando…' : loginOptions.length > 1 ? 'Continuar' : 'Ingresar'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Centro de operaciones</p>
          <h1>Ecommerce Inteligente</h1>
        </div>
        <div className="session-actions">
          <label>
            Organización activa
            <select
              onChange={(event) => setSelectedOrganization(event.target.value)}
              value={selectedOrganization}
            >
              {dashboard.organizations.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationId}>
                  {organization.name} · {organization.role}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={
              loading || selectedOrganization === dashboard.currentOrganization.organizationId
            }
            onClick={() => void switchOrganization()}
            type="button"
          >
            Cambiar
          </button>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => void logout()}
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="dashboard-heading" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Resumen de 24 horas</p>
          <h2 id="dashboard-title">Qué requiere atención ahora</h2>
        </div>
        <form className="filters" onSubmit={applyFilters}>
          <label>
            Desde
            <input
              max={draftFilters.to}
              onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
              required
              type="datetime-local"
              value={draftFilters.from}
            />
          </label>
          <label>
            Hasta
            <input
              min={draftFilters.from}
              onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
              required
              type="datetime-local"
              value={draftFilters.to}
            />
          </label>
          <label>
            Tipo
            <select
              onChange={(event) =>
                setDraftFilters({ ...draftFilters, type: event.target.value as Filters['type'] })
              }
              value={draftFilters.type}
            >
              <option value="">Todos</option>
              {OPERATIONAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" disabled={loading} type="submit">
            Aplicar
          </button>
        </form>
      </section>

      {error !== undefined ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div aria-live="polite" className="sr-only">
        {loading ? 'Actualizando datos operativos' : 'Datos operativos actualizados'}
      </div>

      <section className="summary-grid" aria-label="Indicadores principales">
        <article className="metric-card attention-card">
          <span>Requieren atención</span>
          <strong>{dashboard.summary.totals.requiresAttention}</strong>
          <small>de {dashboard.summary.totals.total} elementos</small>
        </article>
        {dashboard.summary.byType.map((item) => (
          <article className="metric-card" key={item.type}>
            <span>{TYPE_LABELS[item.type]}</span>
            <strong>{item.requiresAttention}</strong>
            <small>{item.total} en la ventana</small>
          </article>
        ))}
      </section>

      <section className="queue-panel" aria-labelledby="queue-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Cola priorizada</p>
            <h2 id="queue-title">Elementos operativos</h2>
          </div>
          <span className="updated-label">Datos de solo lectura</span>
        </div>
        {dashboard.queue.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">✓</span>
            <h3>No hay elementos para este rango</h3>
            <p>Prueba otro período o tipo de operación.</p>
          </div>
        ) : (
          <ul className="queue-list">
            {dashboard.queue.map((item, index) => (
              <li key={`${item.type}-${item.occurredAt}-${index}`}>
                <div className={`status-mark ${item.requiresAttention ? 'needs-attention' : ''}`} />
                <div className="queue-copy">
                  <strong>{TYPE_LABELS[item.type]}</strong>
                  <span>{item.status.replaceAll('_', ' ')}</span>
                  {item.attentionReason === null ? null : (
                    <small>{item.attentionReason.replaceAll('_', ' ')}</small>
                  )}
                </div>
                <time dateTime={item.occurredAt}>
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.occurredAt))}
                </time>
              </li>
            ))}
          </ul>
        )}
        {dashboard.nextCursor === null ? null : (
          <button
            className="secondary-button load-more"
            disabled={loading}
            onClick={() => void loadDashboard(dashboard.nextCursor ?? undefined, true)}
            type="button"
          >
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        )}
      </section>
    </main>
  );
}
