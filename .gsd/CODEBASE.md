# Codebase Map

Generated: 2026-06-20T18:35:07Z | Files: 54 | Described: 0/54
<!-- gsd:codebase-meta {"generatedAt":"2026-06-20T18:35:07Z","fingerprint":"6c02b7fec1f97a772ebaa1ed63c97c23dc720fb9","fileCount":54,"truncated":false} -->

### (root)/
- `DESIGN.md`
- `docker-compose.yml`
- `hookshield.db`
- `pytest.ini`
- `seed_analytics.py`
- `skills-lock.json`
- `test_hookshield.db`

### backend/
- `backend/__init__.py`
- `backend/requirements.txt`

### backend/app/
- `backend/app/__init__.py`
- `backend/app/cache.py`
- `backend/app/circuit_breaker.py`
- `backend/app/config.py`
- `backend/app/db.py`
- `backend/app/idempotency.py`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/tasks.py`
- `backend/app/websockets.py`

### backend/app/routers/
- `backend/app/routers/__init__.py`
- `backend/app/routers/alert_channels.py`
- `backend/app/routers/analytics.py`
- `backend/app/routers/endpoints.py`
- `backend/app/routers/incidents.py`
- `backend/app/routers/ingest.py`
- `backend/app/routers/projects.py`
- `backend/app/routers/severity_priorities.py`
- `backend/app/routers/worker.py`

### db/
- `db/schema.sql`

### frontend/
- `frontend/.gitignore`
- `frontend/AGENTS.md`
- `frontend/CLAUDE.md`
- `frontend/eslint.config.mjs`
- `frontend/next.config.ts`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/postcss.config.mjs`
- `frontend/README.md`
- `frontend/tsconfig.json`

### frontend/app/
- `frontend/app/globals.css`
- `frontend/app/layout.tsx`
- `frontend/app/page.tsx`

### tests/
- `tests/__init__.py`
- `tests/test_alert_channels.py`
- `tests/test_circuit_breaker.py`
- `tests/test_features_option_b.py`
- `tests/test_ingestion.py`
- `tests/test_linear_features.py`
- `tests/test_milestones.py`
- `tests/test_projects.py`
- `tests/test_severity_priorities.py`
- `tests/test_worker.py`
- `tests/verify_system.py`
