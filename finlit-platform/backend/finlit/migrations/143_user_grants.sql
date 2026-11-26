-- Features an administrator opens to named members, whatever their plan (founder, 25 Nov 2026: "only admin can give access to anybody").
-- First feature: the Trading Lab (finlit/lab). One row per member and feature; expires_at NULL = until removed. Deleting an account deletes its grants.
-- Every grant and removal is also written to the audit log (auth.service.audit) with who did it.
CREATE TABLE IF NOT EXISTS user_grants (
    user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature     text        NOT NULL CHECK (feature IN ('trading_lab')),
    granted_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
    granted_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz,
    note        text        CHECK (note IS NULL OR length(note) <= 200),
    PRIMARY KEY (user_id, feature)
);
CREATE INDEX IF NOT EXISTS user_grants_feature ON user_grants (feature, granted_at DESC);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_grants TO finlit_api;
    END IF;
END
$$;
