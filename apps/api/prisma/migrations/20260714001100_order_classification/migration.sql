-- Expand-only order payment classification and immutable state history.
ALTER TYPE "order_payment_mode" ADD VALUE IF NOT EXISTS 'prepaid';
ALTER TYPE "order_payment_mode" ADD VALUE IF NOT EXISTS 'cod';

ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'validating';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'invalid_data';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'ready_for_payment_classification';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'pending_transport_payment';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'ready_for_logistics';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'manual_review';

CREATE TABLE "order_classification_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "rules_json" JSONB NOT NULL,
  "activated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_classification_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_classification_policies_version_positive" CHECK ("version" > 0),
  CONSTRAINT "order_classification_policies_rules_object" CHECK (
    jsonb_typeof("rules_json") = 'object' AND
    "rules_json" ? 'schemaVersion' AND
    "rules_json" ? 'rules'
  ),
  CONSTRAINT "order_classification_policies_activation_consistent" CHECK (
    ("active" AND "activated_at" IS NOT NULL) OR
    (NOT "active" AND "activated_at" IS NULL)
  ),
  CONSTRAINT "order_classification_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_classification_policies_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_classification_policies_store_version_key"
  ON "order_classification_policies"("store_id", "version");
CREATE UNIQUE INDEX "order_classification_policies_one_active_per_store_key"
  ON "order_classification_policies"("store_id") WHERE "active";
CREATE INDEX "order_classification_policies_tenant_active_idx"
  ON "order_classification_policies"("organization_id", "store_id", "active");

CREATE TABLE "order_state_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "from_state" "order_state" NOT NULL,
  "to_state" "order_state" NOT NULL,
  "trigger_type" VARCHAR(80) NOT NULL,
  "trigger_id" VARCHAR(128) NOT NULL,
  "actor_user_id" UUID,
  "reason" VARCHAR(160) NOT NULL,
  "metadata_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_state_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_state_history_distinct_states" CHECK ("from_state" <> "to_state"),
  CONSTRAINT "order_state_history_trigger_not_blank" CHECK (
    length(btrim("trigger_type")) > 0 AND length(btrim("trigger_id")) > 0
  ),
  CONSTRAINT "order_state_history_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "order_state_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_state_history_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_state_history_order_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "order_id")
    REFERENCES "orders"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_state_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_state_history_trigger_transition_key"
  ON "order_state_history"("order_id", "trigger_type", "trigger_id", "to_state");
CREATE INDEX "order_state_history_tenant_order_created_idx"
  ON "order_state_history"("organization_id", "order_id", "created_at");

CREATE FUNCTION prevent_order_state_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'order_state_history is immutable';
END;
$$;

CREATE TRIGGER "order_state_history_immutable"
  BEFORE UPDATE OR DELETE ON "order_state_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_order_state_history_mutation();

-- Safe simulation default for stores that predate this vertical.
INSERT INTO "order_classification_policies" (
  "organization_id", "store_id", "version", "active", "rules_json", "activated_at"
)
SELECT
  "organization_id",
  "id",
  1,
  true,
  '{"schemaVersion":1,"rules":[{"id":"prepaid-paid","priority":100,"paymentMode":"prepaid","financialStatuses":["paid"]},{"id":"cod-tag","priority":90,"paymentMode":"cod","tagsAny":["contraentrega","cod"]}]}'::jsonb,
  CURRENT_TIMESTAMP
FROM "stores"
ON CONFLICT ("store_id", "version") DO NOTHING;
