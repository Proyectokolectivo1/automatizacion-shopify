-- Record the system-owned reason used when identity revocation releases WhatsApp assignments.
ALTER TYPE "whatsapp_conversation_assignment_reason"
  ADD VALUE 'membership_revoked';

ALTER TABLE "whatsapp_conversation_assignment_history"
  DROP CONSTRAINT "whatsapp_assignment_history_shape_check",
  ADD CONSTRAINT "whatsapp_assignment_history_shape_check" CHECK (
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
      AND "reason_code" IN (
        'shift_change',
        'agent_unavailable',
        'manual_release',
        'membership_revoked'
      )
    )
  );
