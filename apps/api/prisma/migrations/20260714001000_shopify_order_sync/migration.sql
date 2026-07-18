-- Expand-only normalized Shopify order snapshots for the simulated provider.
CREATE TYPE "order_payment_mode" AS ENUM ('unclassified');
CREATE TYPE "order_state" AS ENUM ('received');
CREATE TYPE "address_validation_status" AS ENUM ('unvalidated');

ALTER TABLE "webhook_events"
  ADD COLUMN "provider_resource_id" VARCHAR(128);

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_provider_resource_id_not_blank"
    CHECK ("provider_resource_id" IS NULL OR length(btrim("provider_resource_id")) > 0);

CREATE UNIQUE INDEX "webhook_events_organization_store_id_key"
  ON "webhook_events"("organization_id", "store_id", "id");

CREATE TABLE "customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "shopify_customer_id" VARCHAR(128) NOT NULL,
  "first_name" VARCHAR(120),
  "last_name" VARCHAR(120),
  "email" VARCHAR(320),
  "phone_e164" VARCHAR(32),
  "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
  "data_processing_consent" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_shopify_customer_id_not_blank"
    CHECK (length(btrim("shopify_customer_id")) > 0),
  CONSTRAINT "customers_email_normalized"
    CHECK ("email" IS NULL OR ("email" = lower(btrim("email")) AND length("email") > 3)),
  CONSTRAINT "customers_phone_e164_format"
    CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "customers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customers_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customers_organization_store_id_key"
  ON "customers"("organization_id", "store_id", "id");
CREATE UNIQUE INDEX "customers_store_shopify_customer_key"
  ON "customers"("store_id", "shopify_customer_id");
CREATE INDEX "customers_store_phone_idx" ON "customers"("store_id", "phone_e164");
CREATE INDEX "customers_store_email_idx" ON "customers"("store_id", "email");

CREATE TABLE "customer_addresses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "shopify_address_id" VARCHAR(128) NOT NULL,
  "address1" VARCHAR(255) NOT NULL,
  "address2" VARCHAR(255),
  "city" VARCHAR(120) NOT NULL,
  "department" VARCHAR(120),
  "postal_code" VARCHAR(32),
  "country_code" CHAR(2) NOT NULL,
  "normalized_address" VARCHAR(600) NOT NULL,
  "validation_status" "address_validation_status" NOT NULL DEFAULT 'unvalidated',
  "validation_details_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_addresses_shopify_address_id_not_blank"
    CHECK (length(btrim("shopify_address_id")) > 0),
  CONSTRAINT "customer_addresses_required_fields_not_blank"
    CHECK (
      length(btrim("address1")) > 0 AND
      length(btrim("city")) > 0 AND
      length(btrim("normalized_address")) > 0
    ),
  CONSTRAINT "customer_addresses_country_code_format"
    CHECK ("country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "customer_addresses_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_addresses_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_addresses_customer_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "customer_id")
    REFERENCES "customers"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_addresses_organization_store_id_key"
  ON "customer_addresses"("organization_id", "store_id", "id");
CREATE UNIQUE INDEX "customer_addresses_customer_shopify_key"
  ON "customer_addresses"("customer_id", "shopify_address_id");
CREATE INDEX "customer_addresses_tenant_validation_idx"
  ON "customer_addresses"("organization_id", "store_id", "validation_status");

CREATE TABLE "orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "customer_id" UUID,
  "shipping_address_id" UUID,
  "source_webhook_event_id" UUID NOT NULL,
  "shopify_order_id" VARCHAR(128) NOT NULL,
  "shopify_order_name" VARCHAR(80) NOT NULL,
  "shopify_checkout_id" VARCHAR(128),
  "payment_mode" "order_payment_mode" NOT NULL DEFAULT 'unclassified',
  "current_state" "order_state" NOT NULL DEFAULT 'received',
  "currency" CHAR(3) NOT NULL,
  "subtotal_amount" BIGINT NOT NULL,
  "discount_amount" BIGINT NOT NULL,
  "tax_amount" BIGINT NOT NULL,
  "total_amount" BIGINT NOT NULL,
  "transport_charge_amount" BIGINT NOT NULL DEFAULT 0,
  "cod_collect_amount" BIGINT NOT NULL DEFAULT 0,
  "recognized_sale_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "returned_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "source_created_at" TIMESTAMPTZ(3) NOT NULL,
  "source_updated_at" TIMESTAMPTZ(3) NOT NULL,
  "raw_snapshot_json" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_external_identifiers_not_blank"
    CHECK (length(btrim("shopify_order_id")) > 0 AND length(btrim("shopify_order_name")) > 0),
  CONSTRAINT "orders_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "orders_amounts_nonnegative" CHECK (
    "subtotal_amount" >= 0 AND "discount_amount" >= 0 AND "tax_amount" >= 0 AND
    "total_amount" >= 0 AND "transport_charge_amount" >= 0 AND "cod_collect_amount" >= 0
  ),
  CONSTRAINT "orders_version_positive" CHECK ("version" > 0),
  CONSTRAINT "orders_source_timestamp_order" CHECK ("source_updated_at" >= "source_created_at"),
  CONSTRAINT "orders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_customer_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "customer_id")
    REFERENCES "customers"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_shipping_address_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "shipping_address_id")
    REFERENCES "customer_addresses"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_source_webhook_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "source_webhook_event_id")
    REFERENCES "webhook_events"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "orders_organization_store_id_key"
  ON "orders"("organization_id", "store_id", "id");
CREATE UNIQUE INDEX "orders_source_webhook_event_key" ON "orders"("source_webhook_event_id");
CREATE UNIQUE INDEX "orders_source_webhook_tenant_key"
  ON "orders"("organization_id", "store_id", "source_webhook_event_id");
CREATE UNIQUE INDEX "orders_store_shopify_order_key" ON "orders"("store_id", "shopify_order_id");
CREATE INDEX "orders_tenant_state_created_idx"
  ON "orders"("organization_id", "current_state", "source_created_at");
CREATE INDEX "orders_store_source_updated_idx" ON "orders"("store_id", "source_updated_at");

CREATE TABLE "order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "shopify_line_item_id" VARCHAR(128) NOT NULL,
  "shopify_product_id" VARCHAR(128),
  "shopify_variant_id" VARCHAR(128),
  "mastershop_product_id" VARCHAR(128),
  "sku" VARCHAR(120),
  "product_name" VARCHAR(255) NOT NULL,
  "variant_name" VARCHAR(255),
  "quantity" INTEGER NOT NULL,
  "unit_price_amount" BIGINT NOT NULL,
  "unit_cost_amount" BIGINT,
  "total_price_amount" BIGINT NOT NULL,
  "snapshot_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_line_id_not_blank" CHECK (length(btrim("shopify_line_item_id")) > 0),
  CONSTRAINT "order_items_product_name_not_blank" CHECK (length(btrim("product_name")) > 0),
  CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "order_items_amounts_nonnegative" CHECK (
    "unit_price_amount" >= 0 AND "total_price_amount" >= 0 AND
    ("unit_cost_amount" IS NULL OR "unit_cost_amount" >= 0)
  ),
  CONSTRAINT "order_items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_items_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_items_order_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "order_id")
    REFERENCES "orders"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_items_order_shopify_line_key"
  ON "order_items"("order_id", "shopify_line_item_id");
CREATE INDEX "order_items_tenant_sku_idx" ON "order_items"("organization_id", "store_id", "sku");
