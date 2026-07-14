-- Forward-only hardening: reject plaintext or additional fields in credential envelopes.
ALTER TABLE "integration_connections"
  DROP CONSTRAINT "integration_connections_credentials_envelope",
  ADD CONSTRAINT "integration_connections_credentials_envelope"
    CHECK (
      jsonb_typeof("encrypted_credentials") = 'object' AND
      "encrypted_credentials" ?& ARRAY['version', 'iv', 'authTag', 'ciphertext'] AND
      "encrypted_credentials" - ARRAY['version', 'iv', 'authTag', 'ciphertext'] = '{}'::jsonb AND
      jsonb_typeof("encrypted_credentials"->'version') = 'string' AND
      jsonb_typeof("encrypted_credentials"->'iv') = 'string' AND
      jsonb_typeof("encrypted_credentials"->'authTag') = 'string' AND
      jsonb_typeof("encrypted_credentials"->'ciphertext') = 'string' AND
      length("encrypted_credentials"->>'version') > 0 AND
      length("encrypted_credentials"->>'iv') > 0 AND
      length("encrypted_credentials"->>'authTag') > 0 AND
      length("encrypted_credentials"->>'ciphertext') > 0
    );
