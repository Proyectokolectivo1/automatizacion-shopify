-- Expand-only one-use tokens for invitations and password recovery.
CREATE TYPE "account_action_purpose" AS ENUM ('invitation', 'password_reset');

CREATE TABLE "account_action_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "purpose" "account_action_purpose" NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "organization_id" UUID,
  "user_id" UUID,
  "invited_email" VARCHAR(320),
  "invited_role" "organization_role",
  "issued_by_user_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_action_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_action_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "account_action_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "account_action_tokens_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "account_action_tokens_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "account_action_tokens_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "account_action_tokens_single_terminal_state" CHECK ("consumed_at" IS NULL OR "revoked_at" IS NULL),
  CONSTRAINT "account_action_tokens_purpose_shape" CHECK (
    (
      "purpose" = 'invitation'
      AND "organization_id" IS NOT NULL
      AND "user_id" IS NULL
      AND "invited_email" IS NOT NULL
      AND "invited_role" IS NOT NULL
      AND "issued_by_user_id" IS NOT NULL
    ) OR (
      "purpose" = 'password_reset'
      AND "organization_id" IS NULL
      AND "user_id" IS NOT NULL
      AND "invited_email" IS NULL
      AND "invited_role" IS NULL
      AND "issued_by_user_id" IS NULL
    )
  ),
  CONSTRAINT "account_action_tokens_invited_email_canonical" CHECK (
    "invited_email" IS NULL OR (
      "invited_email" = lower(btrim("invited_email"))
      AND position('@' IN "invited_email") > 1
    )
  )
);

CREATE UNIQUE INDEX "account_action_tokens_token_hash_key" ON "account_action_tokens"("token_hash");
CREATE INDEX "account_action_tokens_invitation_idx" ON "account_action_tokens"("organization_id", "invited_email", "purpose", "created_at");
CREATE INDEX "account_action_tokens_user_idx" ON "account_action_tokens"("user_id", "purpose", "created_at");
CREATE INDEX "account_action_tokens_lifecycle_idx" ON "account_action_tokens"("expires_at", "consumed_at", "revoked_at");
