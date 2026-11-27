-- FinLit AI's answer style v2 (ask/variant.py, ask/blueprints.py, ask/shape.py): a switch in Console > Data health > Features, off until the
-- Answer check shows v2 scores better; and the Answer check's runs and answers (ask/check.py), kept so two styles can be compared side by side.
INSERT INTO feature_flags (name, enabled) VALUES ('ask_answer_v2', false) ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS ask_check_runs (
    id          bigserial   PRIMARY KEY,
    style       text        NOT NULL CHECK (style IN ('v1', 'v2')),
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    started_by  text,
    questions   int         NOT NULL DEFAULT 0,
    done        int         NOT NULL DEFAULT 0,
    score       numeric(5, 1),
    status      text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed', 'stopped')),
    note        text
);
CREATE TABLE IF NOT EXISTS ask_check_answers (
    run_id      bigint      NOT NULL REFERENCES ask_check_runs(id) ON DELETE CASCADE,
    qid         text        NOT NULL,
    question    text        NOT NULL,
    kind        text,
    answer      text,
    score       numeric(5, 1),
    checks      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    seconds     numeric(6, 1),
    tokens_in   int,
    tokens_out  int,
    error       text,
    at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, qid)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ask_check_runs, ask_check_answers TO finlit_api;
        GRANT USAGE, SELECT ON SEQUENCE ask_check_runs_id_seq TO finlit_api;
    END IF;
END
$$;
