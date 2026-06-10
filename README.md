# QueryOS

Live Demo: https://queryos-0lt4.onrender.com

AI-powered SAP Order-to-Cash analytics platform that converts natural language into SQL queries and visualizes enterprise relationships through interactive graphs.

Architecture, LLM Strategy, and Guardrails

## Architecture Decisions
- **Split responsibilities by concern**: React + Vite frontend for interaction and visualization; Express backend for data access, graph construction, and LLM-assisted SQL generation.
- **Simple, explicit layering on the backend**: `routes -> controllers -> services -> db` keeps I/O edges thin and logic testable/traceable.
- **Two primary workflows**:
  - `GET /api/graph`: builds an entity-centric graph neighborhood for exploration.
  - `POST /api/query`: converts natural language into a validated SQLite `SELECT`, executes it, and returns rows + a short summary.

## Database Choice (SQLite)
- **Why SQLite**: zero external infra, fast local iteration, predictable performance for a bounded demo dataset, and easy packaging for deployment.
- **Reproducibility**: the DB is derived from the checked-in dataset (`backend/data/sap-o2c-data`). On startup the backend seeds `data.db` if missing, so the environment is self-contained.
- **Operational tuning**: SQLite pragmas are set to keep the API responsive (WAL mode, `foreign_keys=ON`, etc.).
- **Render persistence gotcha**: Render is ephemeral without a persistent disk. This project treats SQLite as demo-only and rebuildable from the dataset on restart/redeploy.

## Graph Modeling Strategy
- **Neighborhood graph, not full-database render**: the graph endpoint expands around a selected entity to keep node counts and query cost bounded.
- **Core O2C chain**: Sales Order → Delivery → Billing → Accounting → Payment.
- **Expanded mapping**: item-level tables and master data are connected into the same graph (partners + addresses, customer assignments, products, plants, storage locations, billing items/cancellations, schedule lines).
- **Controls for scale**: expansion is bounded by configurable limits (e.g., context and partner limits) so the UI remains usable as relationships broaden.

## LLM Prompting Strategy (NL → SQL)
- **LLM is used for SQL generation only**, not as the system of record for answers.
- **Schema-grounded prompt**: the LLM receives an explicit schema and relationship hints, plus strict output requirements.
- **Determinism and simplicity**:
  - Temperature is set to `0`.
  - Output is constrained to a single SQLite `SELECT`.
  - A default `LIMIT` is enforced unless the user requests a smaller one.
- **Answering flow**: the backend executes the validated query and returns rows; the user-facing response is a lightweight summary derived from result shape and count.

## Guardrails (Defense in Depth)
- **Natural-language gating** rejects:
  - prompt-injection patterns and attempts to override instructions
  - write-operation intent (e.g., “delete”, “drop”, “update”)
  - off-domain/general-knowledge questions that do not contain Order-to-Cash signals
- **SQL validation** enforces:
  - `SELECT` only; no multi-statement SQL, no comments, no write keywords
  - dataset-only access (reject unknown tables)
  - fast failure via `EXPLAIN QUERY PLAN` before execution
- **Deployment safety**: CORS is controlled via `CLIENT_ORIGIN` in production so only the frontend origin can call the API.

## Tradeoffs / Next Steps
- SQL support is intentionally constrained (e.g., no CTEs) to reduce risk and simplify validation.
- Regex-based table extraction is conservative; it’s designed for safety over expressiveness.
- For production hardening: add auth, rate limits, caching of common graph expansions, and a persistent database.
