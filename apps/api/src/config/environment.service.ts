import { Injectable } from '@nestjs/common';

import { type Environment, parseEnvironment } from './environment.schema';

@Injectable()
export class EnvironmentService {
  private readonly values: Environment;

  public constructor() {
    this.values = parseEnvironment(process.env);
  }

  public get apiPort(): number {
    return this.values.API_PORT;
  }

  public get apiHost(): string {
    return this.values.API_HOST;
  }

  public get dependencyTimeoutMs(): number {
    return this.values.DEPENDENCY_TIMEOUT_MS;
  }

  public get auth(): Readonly<{
    accessTtlSeconds: number;
    blockDurationMs: number;
    loginMaxAttempts: number;
    rateWindowMs: number;
    refreshTtlSeconds: number;
  }> {
    return {
      accessTtlSeconds: this.values.AUTH_ACCESS_TTL_SECONDS,
      blockDurationMs: this.values.AUTH_BLOCK_DURATION_MS,
      loginMaxAttempts: this.values.AUTH_LOGIN_MAX_ATTEMPTS,
      rateWindowMs: this.values.AUTH_RATE_WINDOW_MS,
      refreshTtlSeconds: this.values.AUTH_REFRESH_TTL_SECONDS,
    };
  }

  public get accountActions(): Readonly<{
    enabled: boolean;
    invitationTtlSeconds: number;
    killSwitch: boolean;
    passwordResetTtlSeconds: number;
  }> {
    return {
      enabled: this.values.AUTH_ACCOUNT_ACTIONS_ENABLED,
      invitationTtlSeconds: this.values.AUTH_INVITATION_TTL_SECONDS,
      killSwitch: this.values.AUTH_ACCOUNT_ACTIONS_KILL_SWITCH,
      passwordResetTtlSeconds: this.values.AUTH_PASSWORD_RESET_TTL_SECONDS,
    };
  }

  public get emailDelivery(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.EMAIL_DELIVERY_ENABLED,
      killSwitch: this.values.EMAIL_KILL_SWITCH,
      simulationMode: this.values.EMAIL_SIMULATION_MODE,
    };
  }

  public get identityAdministration(): Readonly<{ enabled: boolean; killSwitch: boolean }> {
    return {
      enabled: this.values.IDENTITY_ADMIN_ENABLED,
      killSwitch: this.values.IDENTITY_ADMIN_KILL_SWITCH,
    };
  }

  public get identityBootstrap(): Readonly<{
    email: string | undefined;
    enabled: boolean;
    killSwitch: boolean;
    organizationName: string | undefined;
    password: string | undefined;
    secret: string | undefined;
  }> {
    return {
      email: this.values.IDENTITY_BOOTSTRAP_EMAIL,
      enabled: this.values.IDENTITY_BOOTSTRAP_ENABLED,
      killSwitch: this.values.IDENTITY_BOOTSTRAP_KILL_SWITCH,
      organizationName: this.values.IDENTITY_BOOTSTRAP_ORGANIZATION_NAME,
      password: this.values.IDENTITY_BOOTSTRAP_PASSWORD,
      secret: this.values.IDENTITY_BOOTSTRAP_SECRET,
    };
  }

  public get databaseUrl(): string {
    const postgres = this.postgres;
    const user = encodeURIComponent(postgres.user);
    const password = encodeURIComponent(postgres.password);
    return `postgresql://${user}:${password}@${postgres.host}:${postgres.port}/${postgres.database}`;
  }

  public get logLevel(): Environment['LOG_LEVEL'] {
    return this.values.LOG_LEVEL;
  }

  public get nodeEnvironment(): Environment['NODE_ENV'] {
    return this.values.NODE_ENV;
  }

  public get metricsAccess(): Readonly<{
    bearerToken: string | undefined;
    mode: Environment['METRICS_ACCESS_MODE'];
  }> {
    return {
      bearerToken: this.values.METRICS_BEARER_TOKEN,
      mode: this.values.METRICS_ACCESS_MODE,
    };
  }

  public get observabilityAlerts(): Readonly<{
    alertmanagerUrl: string;
    enabled: boolean;
    killSwitch: boolean;
    timeoutMs: number;
  }> {
    return {
      alertmanagerUrl: this.values.OBSERVABILITY_ALERTMANAGER_URL,
      enabled: this.values.OBSERVABILITY_ALERTS_ENABLED,
      killSwitch: this.values.OBSERVABILITY_ALERTS_KILL_SWITCH,
      timeoutMs: this.values.OBSERVABILITY_ALERTS_TIMEOUT_MS,
    };
  }

  public get tracing(): Readonly<{
    enabled: boolean;
    exporterEndpoint: string;
    exporterTimeoutMs: number;
    killSwitch: boolean;
    sampleRatio: number;
    serviceName: string;
  }> {
    return {
      enabled: this.values.OTEL_TRACING_ENABLED,
      exporterEndpoint: this.values.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      exporterTimeoutMs: this.values.OTEL_EXPORT_TIMEOUT_MS,
      killSwitch: this.values.OTEL_TRACING_KILL_SWITCH,
      sampleRatio: this.values.OTEL_TRACE_SAMPLE_RATIO,
      serviceName: this.values.OTEL_SERVICE_NAME,
    };
  }

  public get postgres(): Readonly<{
    database: string;
    host: string;
    password: string;
    port: number;
    user: string;
  }> {
    return {
      database: this.values.POSTGRES_DB,
      host: this.values.POSTGRES_HOST,
      password: this.values.POSTGRES_PASSWORD,
      port: this.values.POSTGRES_PORT,
      user: this.values.POSTGRES_USER,
    };
  }

  public get redis(): Readonly<{ host: string; password: string; port: number }> {
    return {
      host: this.values.REDIS_HOST,
      password: this.values.REDIS_PASSWORD,
      port: this.values.REDIS_PORT,
    };
  }

  public get outbox(): Readonly<{
    batchSize: number;
    dlqName: string;
    enabled: boolean;
    killSwitch: boolean;
    leaseMs: number;
    maxAttempts: number;
    pollIntervalMs: number;
    queueName: string;
    retryBaseMs: number;
    simulationMode: boolean;
  }> {
    return {
      batchSize: this.values.OUTBOX_BATCH_SIZE,
      dlqName: this.values.OUTBOX_DLQ_NAME,
      enabled: this.values.OUTBOX_PUBLISHER_ENABLED,
      killSwitch: this.values.OUTBOX_KILL_SWITCH,
      leaseMs: this.values.OUTBOX_LEASE_MS,
      maxAttempts: this.values.OUTBOX_MAX_ATTEMPTS,
      pollIntervalMs: this.values.OUTBOX_POLL_INTERVAL_MS,
      queueName: this.values.OUTBOX_QUEUE_NAME,
      retryBaseMs: this.values.OUTBOX_RETRY_BASE_MS,
      simulationMode: this.values.OUTBOX_SIMULATION_MODE,
    };
  }

  public get outboxOperations(): Readonly<{ enabled: boolean; killSwitch: boolean }> {
    return {
      enabled: this.values.OUTBOX_OPERATIONS_ENABLED,
      killSwitch: this.values.OUTBOX_OPERATIONS_KILL_SWITCH,
    };
  }

  public get shopify(): Readonly<{
    credentialKeyVersion: string | undefined;
    credentialKeysJson: string | undefined;
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      credentialKeyVersion: this.values.SHOPIFY_CREDENTIAL_KEY_VERSION,
      credentialKeysJson: this.values.SHOPIFY_CREDENTIAL_KEYS_JSON,
      enabled: this.values.SHOPIFY_INTEGRATIONS_ENABLED,
      killSwitch: this.values.SHOPIFY_INTEGRATIONS_KILL_SWITCH,
      simulationMode: this.values.SHOPIFY_SIMULATION_MODE,
    };
  }

  public get shopifyWebhooks(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    maxBodyBytes: number;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.SHOPIFY_WEBHOOKS_ENABLED,
      killSwitch: this.values.SHOPIFY_WEBHOOKS_KILL_SWITCH,
      maxBodyBytes: this.values.SHOPIFY_WEBHOOKS_MAX_BODY_BYTES,
      simulationMode: this.values.SHOPIFY_WEBHOOKS_SIMULATION_MODE,
    };
  }

  public get shopifyOrderSync(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.SHOPIFY_ORDER_SYNC_ENABLED,
      killSwitch: this.values.SHOPIFY_ORDER_SYNC_KILL_SWITCH,
      simulationMode: this.values.SHOPIFY_ORDER_SYNC_SIMULATION_MODE,
    };
  }

  public get orderClassification(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.ORDER_CLASSIFICATION_ENABLED,
      killSwitch: this.values.ORDER_CLASSIFICATION_KILL_SWITCH,
      simulationMode: this.values.ORDER_CLASSIFICATION_SIMULATION_MODE,
    };
  }

  public get transportRates(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.TRANSPORT_RATES_ENABLED,
      killSwitch: this.values.TRANSPORT_RATES_KILL_SWITCH,
      simulationMode: this.values.TRANSPORT_RATES_SIMULATION_MODE,
    };
  }

  public get wompi(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    paymentLinkTtlMinutes: number;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.WOMPI_ENABLED,
      killSwitch: this.values.WOMPI_KILL_SWITCH,
      paymentLinkTtlMinutes: this.values.WOMPI_PAYMENT_LINK_TTL_MINUTES,
      simulationMode: this.values.WOMPI_SIMULATION_MODE,
    };
  }

  public get wompiWebhooks(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    maxBodyBytes: number;
    maxSkewSeconds: number;
  }> {
    return {
      enabled: this.values.WOMPI_WEBHOOKS_ENABLED,
      killSwitch: this.values.WOMPI_WEBHOOKS_KILL_SWITCH,
      maxBodyBytes: this.values.WOMPI_WEBHOOKS_MAX_BODY_BYTES,
      maxSkewSeconds: this.values.WOMPI_WEBHOOKS_MAX_SKEW_SECONDS,
    };
  }

  public get paymentReminders(): Readonly<{
    batchSize: number;
    enabled: boolean;
    killSwitch: boolean;
    pollIntervalMs: number;
    simulationMode: boolean;
  }> {
    return {
      batchSize: this.values.PAYMENT_REMINDERS_BATCH_SIZE,
      enabled: this.values.PAYMENT_REMINDERS_ENABLED,
      killSwitch: this.values.PAYMENT_REMINDERS_KILL_SWITCH,
      pollIntervalMs: this.values.PAYMENT_REMINDERS_POLL_INTERVAL_MS,
      simulationMode: this.values.PAYMENT_REMINDERS_SIMULATION_MODE,
    };
  }

  public get paymentExpiration(): Readonly<{
    batchSize: number;
    defaultAction: 'CANCEL' | 'MARK';
    enabled: boolean;
    killSwitch: boolean;
    pollIntervalMs: number;
    simulationMode: boolean;
  }> {
    return {
      batchSize: this.values.PAYMENT_EXPIRATION_BATCH_SIZE,
      defaultAction: this.values.PAYMENT_EXPIRATION_DEFAULT_ACTION,
      enabled: this.values.PAYMENT_EXPIRATION_ENABLED,
      killSwitch: this.values.PAYMENT_EXPIRATION_KILL_SWITCH,
      pollIntervalMs: this.values.PAYMENT_EXPIRATION_POLL_INTERVAL_MS,
      simulationMode: this.values.PAYMENT_EXPIRATION_SIMULATION_MODE,
    };
  }

  public get wompiReconciliation(): Readonly<{
    batchSize: number;
    enabled: boolean;
    intervalHours: number;
    killSwitch: boolean;
    lookbackHours: number;
    pollIntervalMs: number;
    simulationMode: boolean;
  }> {
    return {
      batchSize: this.values.WOMPI_RECONCILIATION_BATCH_SIZE,
      enabled: this.values.WOMPI_RECONCILIATION_ENABLED,
      intervalHours: this.values.WOMPI_RECONCILIATION_INTERVAL_HOURS,
      killSwitch: this.values.WOMPI_RECONCILIATION_KILL_SWITCH,
      lookbackHours: this.values.WOMPI_RECONCILIATION_LOOKBACK_HOURS,
      pollIntervalMs: this.values.WOMPI_RECONCILIATION_POLL_INTERVAL_MS,
      simulationMode: this.values.WOMPI_RECONCILIATION_SIMULATION_MODE,
    };
  }

  public get whatsapp(): Readonly<{
    credentialKeyVersion: string | undefined;
    credentialKeysJson: string | undefined;
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      credentialKeyVersion: this.values.WHATSAPP_CREDENTIAL_KEY_VERSION,
      credentialKeysJson: this.values.WHATSAPP_CREDENTIAL_KEYS_JSON,
      enabled: this.values.WHATSAPP_INTEGRATIONS_ENABLED,
      killSwitch: this.values.WHATSAPP_INTEGRATIONS_KILL_SWITCH,
      simulationMode: this.values.WHATSAPP_SIMULATION_MODE,
    };
  }

  public get whatsappTemplates(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.WHATSAPP_TEMPLATES_ENABLED,
      killSwitch: this.values.WHATSAPP_TEMPLATES_KILL_SWITCH,
      simulationMode: this.values.WHATSAPP_TEMPLATES_SIMULATION_MODE,
    };
  }

  public get whatsappMessages(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.WHATSAPP_MESSAGES_ENABLED,
      killSwitch: this.values.WHATSAPP_MESSAGES_KILL_SWITCH,
      simulationMode: this.values.WHATSAPP_MESSAGES_SIMULATION_MODE,
    };
  }

  public get whatsappWebhooks(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    maxBodyBytes: number;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.WHATSAPP_WEBHOOKS_ENABLED,
      killSwitch: this.values.WHATSAPP_WEBHOOKS_KILL_SWITCH,
      maxBodyBytes: this.values.WHATSAPP_WEBHOOKS_MAX_BODY_BYTES,
      simulationMode: this.values.WHATSAPP_WEBHOOKS_SIMULATION_MODE,
    };
  }

  public get whatsappInbound(): Readonly<{
    contentRetentionDays: number;
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      contentRetentionDays: this.values.WHATSAPP_INBOUND_CONTENT_RETENTION_DAYS,
      enabled: this.values.WHATSAPP_INBOUND_ENABLED,
      killSwitch: this.values.WHATSAPP_INBOUND_KILL_SWITCH,
      simulationMode: this.values.WHATSAPP_INBOUND_SIMULATION_MODE,
    };
  }

  public get whatsappInbox(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.WHATSAPP_INBOX_ENABLED,
      killSwitch: this.values.WHATSAPP_INBOX_KILL_SWITCH,
      simulationMode: this.values.WHATSAPP_INBOX_SIMULATION_MODE,
    };
  }

  public get whatsappAssignments(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.WHATSAPP_ASSIGNMENTS_ENABLED,
      killSwitch: this.values.WHATSAPP_ASSIGNMENTS_KILL_SWITCH,
      simulationMode: this.values.WHATSAPP_ASSIGNMENTS_SIMULATION_MODE,
    };
  }

  public get operationalQueue(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
  }> {
    return {
      enabled: this.values.OPERATIONAL_QUEUE_ENABLED,
      killSwitch: this.values.OPERATIONAL_QUEUE_KILL_SWITCH,
    };
  }

  public get operationalAlerts(): Readonly<{
    batchSize: number;
    enabled: boolean;
    killSwitch: boolean;
    lookbackHours: number;
    pollIntervalMs: number;
  }> {
    return {
      batchSize: this.values.OPERATIONAL_ALERTS_BATCH_SIZE,
      enabled: this.values.OPERATIONAL_ALERTS_ENABLED,
      killSwitch: this.values.OPERATIONAL_ALERTS_KILL_SWITCH,
      lookbackHours: this.values.OPERATIONAL_ALERTS_LOOKBACK_HOURS,
      pollIntervalMs: this.values.OPERATIONAL_ALERTS_POLL_INTERVAL_MS,
    };
  }

  public get shopifyReconciliation(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    maxWindowHours: number;
    simulationMode: boolean;
    stuckAfterMinutes: number;
  }> {
    return {
      enabled: this.values.SHOPIFY_RECONCILIATION_ENABLED,
      killSwitch: this.values.SHOPIFY_RECONCILIATION_KILL_SWITCH,
      maxWindowHours: this.values.SHOPIFY_RECONCILIATION_MAX_WINDOW_HOURS,
      simulationMode: this.values.SHOPIFY_RECONCILIATION_SIMULATION_MODE,
      stuckAfterMinutes: this.values.SHOPIFY_RECONCILIATION_STUCK_AFTER_MINUTES,
    };
  }

  public get minioHealthUrl(): string {
    const protocol = this.values.MINIO_USE_SSL ? 'https' : 'http';
    return `${protocol}://${this.values.MINIO_HOST}:${this.values.MINIO_API_PORT}/minio/health/ready`;
  }
}
