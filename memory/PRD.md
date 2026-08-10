# PRD — Nishant Jain Portfolio Management Services (PMS) Website

## Original Problem Statement
"Need to build functional website where portfolio graphs dashboard remain and with contact details, and design how portfolio management services looks like."

## User Choices
- Type: Marketing/showcase site for a Portfolio Management Service
- Data: Real FY2026-27 report data (Nishant Jain)
- Contact: Contact form that stores/sends messages
- Design: Professional navy & gold finance look; award-worthy with framer-motion + lenis smooth scroll

## Architecture
- Frontend: React 19 (CRA + craco), TailwindCSS, framer-motion, lenis, recharts, react-fast-marquee, shadcn/ui, sonner.
- Backend: FastAPI + MongoDB (motor). Routes under /api.
- Single-page site composed of sections: Hero, Performance, Allocation, Holdings, Process, Services, Philosophy (marquee), Contact, Footer.
- Data lives in `/app/frontend/src/data/portfolio.js` (all report figures).

## User Persona
Independent equity investor/researcher (Nishant Jain) showcasing a research-driven PMS to prospective HNI clients; visitors are potential investors reviewing performance and reaching out.

## Core Requirements (static)
- Dashboard graphs: portfolio growth over time, returns comparison, sector/marketcap/segment/ETF allocation donuts, contribution attribution, market-cap & ETF performance tables, risk summary.
- Top 10 holdings table.
- Investment process (7 steps) + research approach.
- Services offerings + pillars.
- Contact form -> POST /api/contact (stored in Mongo), GET /api/contact to list.

## Implemented (2026-06)
- Full marketing site with kinetic masked hero reveal, parallax hero background, lenis smooth scroll, scroll-reveal animations.
- All dashboard charts with report data (XIRR 52.81%, CAGR 45.52%, Win Rate 72.22%, Net P&L ₹3,78,101.08, Net ROI 12.60%, Max Drawdown -8.67%, Sharpe 2.14, etc.).
- Contact form with investment-size chips, validation, success/error toasts, backend persistence.
- Backend: GET /api/, POST /api/contact, GET /api/contact. Tested 6/6 pytest + full frontend flow (100%).

## Backlog (not yet built)
- P1: Admin view to read submitted contact messages (currently only via GET API).
- P1: Email notification to Nishant on new contact (Resend integration).
- P2: PDF report download / "view full report" link.
- P2: Testimonials / client logos section.
- P2: Blog / research notes section.

## Next Tasks
- Wire real email/phone once provided by user.
- Optional: email alerts on new leads.
