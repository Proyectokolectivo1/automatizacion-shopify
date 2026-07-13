-- Expand-only initial foundation. Creates new types, tables, constraints and indexes.
CREATE TYPE "store_status" AS ENUM ('pending', 'active', 'disconnected', 'suspended');
CREATE TYPE "idempotency_status" AS ENUM ('processing', 'completed', 'failed');
CREATE TYPE "outbox_status" AS ENUM ('pending', 'processing', 'published', 'failed');

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Bogota',
  "default_currency" CHAR(3) NOT NULL DEFAULT 'COP',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizations_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "organizations_timezone_not_blank" CHECK (length(btrim("timezone")) > 0),
  CONSTRAINT "organizations_currency_iso_format" CHECK ("default_currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "stores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "shopify_shop_domain" VARCHAR(255) NOT NULL,
  "status" "store_status" NOT NULL DEFAULT 'pending',
  "timezone" VARCHAR(64) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "settings_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stores_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "stores_timezone_not_blank" CHECK (length(btrim("timezone")) > 0),
  CONSTRAINT "stores_currency_iso_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "stores_shopify_domain_canonical" CHECK (
    "shopify_shop_domain" = lower("shopify_shop_domain") AND
    "shopify_shop_domain" ~ '^[a-z0-9][a-z0-9-]*[.]myshopify[.]com$'
  ),
  CONSTRAINT "stores_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "idempotency_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" VARCHAR(120) NOT NULL,
  "key" VARCHAR(500) NOT NULL,
  "request_hash" VARCHAR(128) NOT NULL,
  "response_snapshot_json" JSONB,
  "status" "idempotency_status" NOT NULL DEFAULT 'processing',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_keys_scope_not_blank" CHECK (length(btrim("scope")) > 0),
  CONSTRAINT "idempotency_keys_key_not_blank" CHECK (length(btrim("key")) > 0),
  CONSTRAINT "idempotency_keys_request_hash_not_blank" CHECK (length(btrim("request_hash")) > 0)
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "aggregate_type" VARCHAR(120) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "event_version" SMALLINT NOT NULL DEFAULT 1,
  "payload_json" JSONB NOT NULL,
  "correlation_id" VARCHAR(128) NOT NULL,
  "causation_id" VARCHAR(128),
  "status" "outbox_status" NOT NULL DEFAULT 'pending',
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_aggregate_type_not_blank" CHECK (length(btrim("aggregate_type")) > 0),
  CONSTRAINT "outbox_events_event_type_not_blank" CHECK (length(btrim("event_type")) > 0),
  CONSTRAINT "outbox_events_event_version_positive" CHECK ("event_version" > 0),
  CONSTRAINT "outbox_events_correlation_id_not_blank" CHECK (length(btrim("correlation_id")) > 0),
  CONSTRAINT "outbox_events_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
  CONSTRAINT "outbox_events_published_state_consistent" CHECK (
    ("status" = 'published' AND "published_at" IS NOT NULL) OR
    ("status" <> 'published' AND "published_at" IS NULL)
  )
);

CREATE UNIQUE INDEX "stores_shopify_shop_domain_key" ON "stores"("shopify_shop_domain");
CREATE INDEX "stores_organization_status_idx" ON "stores"("organization_id", "status");
CREATE INDEX "stores_created_at_idx" ON "stores"("created_at");
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");
CREATE INDEX "idempotency_keys_status_expires_at_idx" ON "idempotency_keys"("status", "expires_at");
CREATE INDEX "outbox_events_dispatch_idx" ON "outbox_events"("status", "available_at", "created_at");
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events"("aggregate_type", "aggregate_id", "created_at");
CREATE INDEX "outbox_events_correlation_id_idx" ON "outbox_events"("correlation_id");
