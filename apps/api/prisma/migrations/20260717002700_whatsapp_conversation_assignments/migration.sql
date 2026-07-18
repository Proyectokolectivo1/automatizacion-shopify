-- Tenant-safe conversation assignment in explicit WhatsApp simulation mode only.
CREATE TYPE "whatsapp_conversation_assignment_action" AS ENUM (
  'claim',
  'reassign',
  'unassign'
);

CREATE TYPE "whatsapp_conversation_assignment_reason" AS ENUM (
  'workload_balance',
  'shift_change',
  'specialist_routing',
  'agent_unavailable',
  'manual_release'
);

CREATE UNIQUE INDEX "organization_memberships_organization_id_key"
  ON "organization_memberships"("organization_id", "id");

ALTER TABLE "whatsapp_conversations"
  ADD COLUMN "assigned_membership_id" UUID,
  ADD COLUMN "assignment_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "assigned_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "whatsapp_conversations_assignment_version_check"
    CHECK ("assignment_version" >= 0),
  ADD CONSTRAINT "whatsapp_conversations_assignment_shape_check" CHECK (
    ("assigned_membership_id" IS NULL AND "assigned_at" IS NULL)
    OR ("assigned_membership_id" IS NOT NULL AND "assigned_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "whatsapp_conversations_assignee_tenant_fkey"
    FOREIGN KEY ("organization_id", "assigned_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "whatsapp_conversations_tenant_assignee_last_idx"
  ON "whatsapp_conversations"("organization_id", "assigned_membership_id", "last_message_at");

CREATE TABLE "whatsapp_conversation_assignment_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "action" "whatsapp_conversation_assignment_action" NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "previous_assignee_membership_id" UUID,
  "new_assignee_membership_id" UUID,
  "reason_code" "whatsapp_conversation_assignment_reason",
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_conversation_assignment_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_assignment_history_version_check" CHECK ("version" > 0),
  CONSTRAINT "whatsapp_assignment_history_shape_check" CHECK (
    (
      "action" = 'claim'
      AND "previous_assignee_membership_id" IS NULL
      AND "new_assignee_membership_id" = "actor_membership_id"
      AND "reason_code" IS NULL
    ) OR (
      "action" = 'reassign'
      AND "previous_assignee_membership_id" IS NOT NULL
      AND "new_assignee_membership_id" IS NOT NULL
      AND "previous_assignee_membership_id" <> "new_assignee_membership_id"
      AND "reason_code" IS NOT NULL
      AND "reason_code" IN ('workload_balance', 'shift_change', 'specialist_routing')
    ) OR (
      "action" = 'unassign'
      AND "previous_assignee_membership_id" IS NOT NULL
      AND "new_assignee_membership_id" IS NULL
      AND "reason_code" IS NOT NULL
      AND "reason_code" IN ('shift_change', 'agent_unavailable', 'manual_release')
    )
  )
);

ALTER TABLE "whatsapp_conversation_assignment_history"
  ADD CONSTRAINT "whatsapp_conversation_assignment_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_assignment_history_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_assignment_history_conversation_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "conversation_id")
    REFERENCES "whatsapp_conversations"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_assignment_history_actor_tenant_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_assignment_history_previous_tenant_fkey"
    FOREIGN KEY ("organization_id", "previous_assignee_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_assignment_history_new_tenant_fkey"
    FOREIGN KEY ("organization_id", "new_assignee_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_assignment_history_tenant_id_key"
  ON "whatsapp_conversation_assignment_history"("organization_id", "store_id", "id");
CREATE UNIQUE INDEX "whatsapp_assignment_history_conversation_version_key"
  ON "whatsapp_conversation_assignment_history"("conversation_id", "version");
CREATE INDEX "whatsapp_assignment_history_actor_created_idx"
  ON "whatsapp_conversation_assignment_history"("organization_id", "actor_membership_id", "created_at");
CREATE INDEX "whatsapp_assignment_history_assignee_created_idx"
  ON "whatsapp_conversation_assignment_history"("organization_id", "new_assignee_membership_id", "created_at");

CREATE FUNCTION prevent_whatsapp_assignment_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'whatsapp conversation assignment history is immutable' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "whatsapp_conversation_assignment_history_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_conversation_assignment_history"
FOR EACH ROW EXECUTE FUNCTION prevent_whatsapp_assignment_history_mutation();
