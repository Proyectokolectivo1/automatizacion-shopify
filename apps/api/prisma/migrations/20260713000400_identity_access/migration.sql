-- Expand-only identity, membership, revocable session, durable rate limit and audit foundation.
CREATE TYPE "user_status" AS ENUM ('active', 'disabled');
CREATE TYPE "membership_status" AS ENUM ('active', 'revoked');
CREATE TYPE "organization_role" AS ENUM ('owner', 'admin', 'operations', 'logistics', 'support', 'finance', 'read_only');
CREATE TYPE "audit_outcome" AS ENUM ('success', 'failure', 'denied');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(320) NOT NULL,
  "password_hash" VARCHAR(512) NOT NULL,
  "password_algorithm" VARCHAR(32) NOT NULL DEFAULT 'argon2id-v1',
  "password_parameters_json" JSONB NOT NULL,
  "status" "user_status" NOT NULL DEFAULT 'active',
  "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(3),
  "last_login_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_canonical" CHECK ("email" = lower(btrim("email")) AND position('@' IN "email") > 1),
  CONSTRAINT "users_password_hash_not_blank" CHECK (length(btrim("password_hash")) > 0),
  CONSTRAINT "users_password_algorithm_not_blank" CHECK (length(btrim("password_algorithm")) > 0),
  CONSTRAINT "users_failed_login_attempts_nonnegative" CHECK ("failed_login_attempts" >= 0)
);

CREATE TABLE "organization_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "organization_role" NOT NULL,
  "status" "membership_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "access_token_hash" CHAR(64) NOT NULL,
  "refresh_token_hash" CHAR(64) NOT NULL,
  "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "refresh_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "refresh_version" INTEGER NOT NULL DEFAULT 0,
  "user_agent_hash" CHAR(64),
  "ip_hash" CHAR(64),
  "last_used_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "auth_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "auth_sessions_access_hash_format" CHECK ("access_token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_sessions_refresh_hash_format" CHECK ("refresh_token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_sessions_expiry_order" CHECK ("refresh_expires_at" > "access_expires_at"),
  CONSTRAINT "auth_sessions_refresh_version_nonnegative" CHECK ("refresh_version" >= 0)
);

CREATE TABLE "auth_rate_limits" (
  "key_hash" CHAR(64) NOT NULL,
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "blocked_until" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key_hash"),
  CONSTRAINT "auth_rate_limits_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
  CONSTRAINT "auth_rate_limits_key_hash_format" CHECK ("key_hash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" UUID,
  "organization_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "outcome" "audit_outcome" NOT NULL,
  "resource_type" VARCHAR(120),
  "resource_id" VARCHAR(128),
  "correlation_id" VARCHAR(128) NOT NULL,
  "metadata_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_action_not_blank" CHECK (length(btrim("action")) > 0),
  CONSTRAINT "audit_logs_correlation_id_not_blank" CHECK (length(btrim("correlation_id")) > 0)
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_locked_until_idx" ON "users"("status", "locked_until");
CREATE UNIQUE INDEX "organization_memberships_organization_user_key" ON "organization_memberships"("organization_id", "user_id");
CREATE INDEX "organization_memberships_user_status_idx" ON "organization_memberships"("user_id", "status");
CREATE INDEX "organization_memberships_role_status_idx" ON "organization_memberships"("organization_id", "role", "status");
CREATE UNIQUE INDEX "auth_sessions_access_token_hash_key" ON "auth_sessions"("access_token_hash");
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");
CREATE INDEX "auth_sessions_user_active_idx" ON "auth_sessions"("user_id", "revoked_at", "refresh_expires_at");
CREATE INDEX "auth_sessions_organization_active_idx" ON "auth_sessions"("organization_id", "revoked_at");
CREATE INDEX "auth_rate_limits_blocked_until_idx" ON "auth_rate_limits"("blocked_until");
CREATE INDEX "audit_logs_actor_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_organization_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_action_outcome_created_at_idx" ON "audit_logs"("action", "outcome", "created_at");
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");
