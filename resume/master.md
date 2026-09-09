# Dipankar Saha
Senior Backend / Full-Stack Engineer

Kolkata, India  |  dip7501686040@gmail.com  |  +91 70017 33750  |  github.com/dip7501686040  |  linkedin.com/in/dipankar-saha-247725153

## Summary
Backend engineer with 6+ years designing event-driven microservice platforms — NestJS/Node.js services over gRPC and RabbitMQ, per-service Postgres, multi-tenant RBAC, and full OpenTelemetry observability. Recently built an 11-service AI notification platform end to end.

## Skills
**Backend:** Node.js, NestJS, TypeScript, REST APIs, GraphQL, gRPC, JWT / OAuth2, RBAC
**Messaging & Architecture:** RabbitMQ, Event-Driven Architecture, Microservices Design, Monorepo (pnpm / Turborepo)
**Databases:** PostgreSQL, pgvector, MySQL, MongoDB, Redis, Prisma, Drizzle ORM
**Observability:** OpenTelemetry, Prometheus, Grafana, Jaeger, Loki
**Cloud & DevOps:** AWS (EC2, S3, EKS, ECR, ELBv2), Kubernetes, Helm, ArgoCD (GitOps), Terraform, Docker, GitHub Actions, Jenkins, CI/CD
**AI & LLM:** OpenAI API, RAG (pgvector), LangGraph agents, Prompt Engineering, LLM Workflow Design
**Frontend:** React, Next.js (App Router), Tailwind CSS, Radix UI

## Experience

### Senior Software Engineer — Veztraa Solutions
Remote | Mar 2023 — Present
- Design and build enterprise SaaS applications with React, Next.js, TypeScript, Node.js and NestJS, following a microservices architecture.
- Lead architecture discussions for scalable, cloud-native services — modular backends with REST APIs and event-driven messaging.
- Implement secure authentication and authorization with JWT and role-based access control.
- Optimize MongoDB aggregation pipelines and MySQL queries through indexing and schema tuning.
- Containerize services with Docker, deploy to Kubernetes on AWS, and maintain CI/CD with GitHub Actions and Jenkins.
- Mentor junior engineers on service design, testing, and delivery.
*Tech: React, Next.js, TypeScript, Node.js, NestJS, Docker, Kubernetes, MySQL, MongoDB, RabbitMQ, AWS, GitHub Actions, Jenkins*

### Software Engineer — Tata Consultancy Services (TCS)
Kolkata, India | Apr 2021 — Feb 2023
- Built enterprise insurance applications for Zurich Insurance with Angular and Node.js.
- Developed scalable REST APIs and frontend modules for high-volume business workflows.
- Worked with distributed teams in Agile/Scrum; resolved production issues while keeping availability high.
- Improved application performance and reduced production defects through proactive optimization.
*Tech: Angular, Node.js, JavaScript, REST APIs, MySQL, Git*

### Software Engineer — Asparrowtech
Indore, India | Jun 2020 — Mar 2021
- Built responsive web applications with JavaScript frameworks and Node.js.
- Developed backend APIs and integrated third-party services; contributed to database design and enhancements.
- Collaborated directly with clients to deliver custom software.
*Tech: JavaScript, Node.js, REST APIs*

## Projects

### AI-Powered Event-Driven Notification Platform
11-service NestJS platform that routes every event through tenant-scoped rules and an LLM analysis pass so only de-duplicated, severity-ranked notifications reach a person.
- pnpm + Turborepo monorepo of 11 NestJS microservices (gRPC internally, REST at the edge) plus a Python/FastAPI prediction service; each service owns its own Postgres database.
- Asynchronous RabbitMQ event choreography on a single durable topic exchange; synchronous gRPC reserved for auth, tenancy, and template rendering.
- Multi-provider AI event analysis and pgvector RAG duplicate-incident detection; multi-tenant RBAC and API-key management; multi-channel delivery with retry scheduling.
- Tenant-scoped OpenTelemetry → Prometheus / Loki / Jaeger / Grafana observability; k6 + HPA + KEDA load and autoscaling harness; Stripe billing.
*Tech: NestJS, TypeScript, gRPC, RabbitMQ, PostgreSQL, Redis, pgvector, OpenAI, FastAPI, Docker, Kubernetes, OpenTelemetry*  ·  https://github.com/dip7501686040/ai-notification-system

### Platform GitOps — Helm + ArgoCD Delivery
Reproducible, auditable Kubernetes delivery for a 13-service platform: every change to what runs in the cluster is a git commit ArgoCD reconciles.
- One shared Helm chart templates all 11 NestJS services, layered with per-service, per-environment values files; web and prediction-service have their own charts.
- ArgoCD auto-syncs from git with a bounded RollingSync ApplicationSet (maxUpdate 1) so a multi-service release doesn't spike CPU.
- Database migrations run as an ArgoCD PreSync hook Job keyed by a schema hash — an unchanged schema is a no-op.
- Jenkins pipeline (itself a Helm-managed Kubernetes workload) builds and pushes each service image and commits the image-tag bump back for ArgoCD to pick up.
*Tech: Helm, ArgoCD, Kubernetes, Jenkins, GitOps*  ·  https://github.com/dip7501686040/platform-gitops

### Personal Growth AI OS
A private system that distills real engineering work into a proof-of-skills graph feeding career, content, and learning agents.
- Next.js 16 App Router + Supabase Postgres (Drizzle, RLS); a pgvector RAG knowledge base with cross-source duplicate detection and deterministic entity linking.
- Eight structured LLM agents behind a provider-ladder abstraction (Gemini / OpenAI / Anthropic) with automatic fallback; a LangGraph extraction agent.
- Seven nightly Vercel cron jobs for ingestion, mapping, and briefings; a deterministic per-JD proof-of-work retrieval endpoint.
*Tech: Next.js, TypeScript, PostgreSQL, pgvector, Drizzle, LangGraph, OpenAI / Anthropic APIs, Vercel*  ·  https://github.com/dip7501686040/personal-growth-ai-os

### Japshop Admin Panel — Financial Logbook
Production admin panel replacing paper logbooks with per-customer credit/debit tracking and two-layer RBAC.
- Per-customer GAVE/GOT ledger entries across multiple logbooks with running balances computed per customer.
- Two-layer RBAC — role-based menu permissions plus per-user, per-logbook CRUD permissions — with OTP-gated superadmin login and a database-driven navigation menu.
- Next.js + NestJS + Prisma + PostgreSQL, containerized and deployed to Kubernetes.
*Tech: Next.js, NestJS, Prisma, PostgreSQL, JWT, Docker, Kubernetes*

## Education
**B.Tech in Information Technology**, Siliguri Institute of Technology — 2016 – 2020
