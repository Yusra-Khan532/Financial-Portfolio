# FinLit Financial Portfolio

Investment-research website with an admin CMS, Stock Fundamentals dashboard and on-demand Premium Company Reports.

## Premium model documentation

- [Implementation, formulas and source-resolution policy](docs/premium-model-implementation.md)
- [Model inputs, outputs and API contracts](docs/premium-model-input-output.md)
- [Report lifecycle and deployment](docs/premium-report-lifecycle.md)

The deterministic engine and its parameters live in `backend/premium_engine.py` and `backend/premium_model_config.py`. Reports share the Stock Fundamentals data loader. Generated audit files, report previews and temporary databases are ignored; small regression fixtures under `backend/tests/fixtures` are intentional source-controlled test data.
