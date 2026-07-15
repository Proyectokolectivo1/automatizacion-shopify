CREATE TABLE "transport_rate_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID,
  "version" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'COP',
  "active" BOOLEAN NOT NULL DEFAULT false,
  "activated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_rate_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transport_rate_policies_version_positive" CHECK ("version" > 0),
  CONSTRAINT "transport_rate_policies_currency_cop" CHECK ("currency" = 'COP'),
  CONSTRAINT "transport_rate_policies_activation_consistency" CHECK (
    ("active" AND "activated_at" IS NOT NULL) OR
    (NOT "active" AND "activated_at" IS NULL)
  ),
  CONSTRAINT "transport_rate_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transport_rate_policies_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "transport_rate_policies_organization_id_id_key"
  ON "transport_rate_policies"("organization_id", "id");
CREATE UNIQUE INDEX "transport_rate_policies_scope_version_key"
  ON "transport_rate_policies"(
    "organization_id",
    COALESCE("store_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "version"
  );
CREATE UNIQUE INDEX "transport_rate_policies_one_active_scope_key"
  ON "transport_rate_policies"(
    "organization_id",
    COALESCE("store_id", '00000000-0000-0000-0000-000000000000'::uuid)
  ) WHERE "active";
CREATE INDEX "transport_rate_policies_tenant_active_idx"
  ON "transport_rate_policies"("organization_id", "store_id", "active");

CREATE TABLE "transport_rate_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "policy_id" UUID NOT NULL,
  "rule_key" VARCHAR(80) NOT NULL,
  "city" VARCHAR(120),
  "department" VARCHAR(120),
  "shopify_product_id" VARCHAR(128),
  "priority" INTEGER NOT NULL,
  "amount" BIGINT NOT NULL,
  "valid_from" TIMESTAMPTZ(3),
  "valid_to" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_rate_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transport_rate_rules_priority_range" CHECK ("priority" BETWEEN 0 AND 10000),
  CONSTRAINT "transport_rate_rules_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "transport_rate_rules_validity_range" CHECK (
    "valid_from" IS NULL OR "valid_to" IS NULL OR "valid_from" < "valid_to"
  ),
  CONSTRAINT "transport_rate_rules_rule_key_not_blank" CHECK (btrim("rule_key") <> ''),
  CONSTRAINT "transport_rate_rules_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transport_rate_rules_policy_tenant_fkey"
    FOREIGN KEY ("organization_id", "policy_id") REFERENCES "transport_rate_policies"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "transport_rate_rules_policy_rule_key"
  ON "transport_rate_rules"("policy_id", "rule_key");
CREATE UNIQUE INDEX "transport_rate_rules_organization_id_id_key"
  ON "transport_rate_rules"("organization_id", "id");
CREATE UNIQUE INDEX "transport_rate_rules_organization_policy_id_key"
  ON "transport_rate_rules"("organization_id", "policy_id", "id");
CREATE INDEX "transport_rate_rules_tenant_priority_idx"
  ON "transport_rate_rules"("organization_id", "policy_id", "priority");
CREATE INDEX "transport_rate_rules_product_idx"
  ON "transport_rate_rules"("shopify_product_id");

CREATE TABLE "transport_rate_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "policy_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "amount" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
  "idempotency_key" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_rate_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transport_rate_decisions_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "transport_rate_decisions_currency_cop" CHECK ("currency" = 'COP'),
  CONSTRAINT "transport_rate_decisions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transport_rate_decisions_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transport_rate_decisions_order_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "order_id") REFERENCES "orders"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transport_rate_decisions_policy_tenant_fkey"
    FOREIGN KEY ("organization_id", "policy_id") REFERENCES "transport_rate_policies"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transport_rate_decisions_rule_policy_fkey"
    FOREIGN KEY ("organization_id", "policy_id", "rule_id") REFERENCES "transport_rate_rules"("organization_id", "policy_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "transport_rate_decisions_idempotency_key"
  ON "transport_rate_decisions"("idempotency_key");
CREATE UNIQUE INDEX "transport_rate_decisions_order_policy_rule_key"
  ON "transport_rate_decisions"("order_id", "policy_id", "rule_id");
CREATE INDEX "transport_rate_decisions_tenant_order_idx"
  ON "transport_rate_decisions"("organization_id", "order_id", "created_at");
