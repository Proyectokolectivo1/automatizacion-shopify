-- Tenant-safe, local-only WhatsApp template catalog. This migration does not register templates in Meta.
CREATE TYPE "whatsapp_template_category" AS ENUM ('authentication', 'marketing', 'utility');
CREATE TYPE "whatsapp_template_status" AS ENUM ('local_draft', 'simulated_approved', 'simulated_rejected');

CREATE TABLE "whatsapp_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "template_key" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "meta_template_name" VARCHAR(512) NOT NULL,
  "language_code" VARCHAR(16) NOT NULL,
  "category" "whatsapp_template_category" NOT NULL,
  "status" "whatsapp_template_status" NOT NULL DEFAULT 'local_draft',
  "body_template" VARCHAR(4096) NOT NULL,
  "variables_schema_json" JSONB NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "status_reason_code" VARCHAR(80),
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_templates_version_check" CHECK ("version" > 0),
  CONSTRAINT "whatsapp_templates_name_check" CHECK ("name" ~ '^[a-z][a-z0-9_]{2,119}$'),
  CONSTRAINT "whatsapp_templates_meta_name_check" CHECK (
    char_length("meta_template_name") >= 3 AND "meta_template_name" ~ '^[a-z][a-z0-9_]+$'
  ),
  CONSTRAINT "whatsapp_templates_language_check" CHECK ("language_code" ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  CONSTRAINT "whatsapp_templates_event_type_check" CHECK ("event_type" ~ '^[a-z][a-z0-9_.-]{2,159}$'),
  CONSTRAINT "whatsapp_templates_body_check" CHECK (char_length("body_template") BETWEEN 1 AND 4096),
  CONSTRAINT "whatsapp_templates_variables_schema_check" CHECK (
    jsonb_typeof("variables_schema_json") = 'object'
    AND COALESCE("variables_schema_json" ->> 'version' = 'v1', false)
    AND COALESCE(jsonb_typeof("variables_schema_json" -> 'variables') = 'array', false)
  ),
  CONSTRAINT "whatsapp_templates_review_shape_check" CHECK (
    ("status" = 'local_draft' AND "reviewed_at" IS NULL AND "status_reason_code" IS NULL)
    OR ("status" = 'simulated_approved' AND "reviewed_at" IS NOT NULL AND "status_reason_code" IS NULL)
    OR ("status" = 'simulated_rejected' AND "reviewed_at" IS NOT NULL AND "status_reason_code" IS NOT NULL)
  ),
  CONSTRAINT "whatsapp_templates_active_status_check" CHECK (
    NOT "active" OR "status" = 'simulated_approved'
  )
);

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_templates_key_version_key"
  ON "whatsapp_templates"("template_key", "version");
CREATE UNIQUE INDEX "whatsapp_templates_store_meta_language_version_key"
  ON "whatsapp_templates"("store_id", "meta_template_name", "language_code", "version");
CREATE UNIQUE INDEX "whatsapp_templates_organization_store_id_key"
  ON "whatsapp_templates"("organization_id", "store_id", "id");
CREATE UNIQUE INDEX "whatsapp_templates_one_active_event_language_key"
  ON "whatsapp_templates"("store_id", "event_type", "language_code") WHERE "active";
CREATE INDEX "whatsapp_templates_tenant_created_idx"
  ON "whatsapp_templates"("organization_id", "store_id", "created_at");
CREATE INDEX "whatsapp_templates_event_language_status_idx"
  ON "whatsapp_templates"("store_id", "event_type", "language_code", "status");

-- Template content and identity are immutable. Lifecycle columns remain mutable by the service.
CREATE FUNCTION prevent_whatsapp_template_content_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.template_key IS DISTINCT FROM OLD.template_key
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.meta_template_name IS DISTINCT FROM OLD.meta_template_name
     OR NEW.language_code IS DISTINCT FROM OLD.language_code
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.body_template IS DISTINCT FROM OLD.body_template
     OR NEW.variables_schema_json IS DISTINCT FROM OLD.variables_schema_json
     OR NEW.event_type IS DISTINCT FROM OLD.event_type THEN
    RAISE EXCEPTION 'whatsapp template content is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "whatsapp_templates_immutable_content"
BEFORE UPDATE ON "whatsapp_templates"
FOR EACH ROW EXECUTE FUNCTION prevent_whatsapp_template_content_mutation();
