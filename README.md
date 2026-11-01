# FinLit Financial Portfolio

The application and AWS deployment source live in **[finlit-platform/](finlit-platform/)**. Make all application changes there. The retired root-level React app, backend and alternative hosting configurations have been removed.

- [Platform architecture and local development](finlit-platform/README.md)
- [AWS deployment runbook](finlit-platform/docs/AWS-DEPLOY.md)
- [Team workflow and deployments](finlit-platform/docs/TEAM-DEPLOY.md)
- [Premium model contract](finlit-platform/docs/prism/CONTRACT.md)

Repository-level GitHub Actions and Dependabot configuration live in `.github/` and target `finlit-platform/`. Production settings remain outside the clone at `/opt/finlit/.env.aws`.
