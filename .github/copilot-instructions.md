🔴 CRITICAL: Instruction Priority

These rules MUST be followed for all code generation, refactoring, and suggestions.
Do NOT deviate unless explicitly instructed by the user.

1. PROJECT CONTEXT

This project is a payment switch simulation platform designed to replicate real-world payment processing systems.

It integrates with multiple payment providers, including:

A fully functional PayU integration (LIVE, end-to-end working)

Additional real provider implementations

Mock providers for testing and failure simulation

The system must behave like a production-grade payment orchestration layer.

2. CORE FUNCTIONALITY (STRICTLY ENFORCED)
2.1 Payment Lifecycle Management

All payment flows MUST support:

Required Operations

AUTH (Authorization)

CAPTURE

PAYMENT (Auth + Capture in one step)

REFUND

VOID

Rules

Each transaction MUST have a clear state machine

State transitions MUST be explicit and validated

Invalid transitions MUST be rejected

Example State Flow
INITIATED → AUTHORIZED → CAPTURED
INITIATED → AUTHORIZED → VOIDED
INITIATED → PAYMENT → CAPTURED

CAPTURED → REFUNDED
FAILED (terminal)

Requirements

Use idempotency keys for all operations

Prevent duplicate processing at all costs

Store full transaction history (audit trail)

2.2 Provider Abstraction Layer (CRITICAL)

The system MUST implement a strict provider adapter pattern.

Rules

Each provider MUST implement a common interface:

authorize() OR payment() OR both, depending on supported flows
capture()
refund()
void()
handleCallback()


NO provider-specific logic is allowed outside the adapter layer

PayU (IMPORTANT)

PayU integration is:

LIVE

FULLY FUNCTIONAL

USED AS REFERENCE IMPLEMENTATION

Enforcement

Any new provider MUST follow the exact PayU structure

Do NOT rewrite PayU logic unless fixing a bug

Reuse patterns from PayU adapter

2.3 Routing Engine (HIGH PRIORITY)

Routing is a core differentiator and MUST be implemented cleanly.

Responsibilities

Select provider based on:

Merchant configuration

Payment method

Priority

Failover rules

Requirements

Routing MUST be:

Config-driven (DB or config service)

NOT hardcoded

Failover Logic

If provider fails:

Retry (if retryable)

Switch to next provider (if configured)

Example
Merchant A:
  Card → PayU (primary) → Provider2 (fallback)

2.4 Callback / Webhook Handling
Requirements

Handle asynchronous notifications from providers

MUST support:

Signature validation

Idempotent processing

State reconciliation

Rules

Callbacks MUST:

Never create duplicate transactions

Only update existing ones

Must handle:

Delayed callbacks

Duplicate callbacks

2.5 Error Handling & Resilience
REQUIRED

Retry logic with exponential backoff

Clear classification:

Retryable errors

Non-retryable errors

Examples

Network timeout → retry

Validation error → do NOT retry

2.6 Data Integrity
MUST

All operations MUST be:

Atomic where required

Consistent

Requirements

Use DB constraints where applicable

Store:

provider_reference

internal_reference

timestamps for every state change

Create relationships between Payment/Auth records to subsequent operations (capture, refund, void) to maintain a clear audit trail and traceability of the entire payment lifecycle.

save provider responses for debugging and reconciliation purposes, ensuring that all interactions with external providers are fully traceable and auditable.

save provider data in a normalized format to facilitate easier querying and analysis, while preserving the original response for reference.

3. ARCHITECTURE PRINCIPLES (STRICTLY ENFORCED)
3.1 Separation of Concerns

You MUST maintain strict boundaries:

Layer	Responsibility
API Layer	Request/response handling only
Service Layer	Business logic
Routing Layer	Provider selection
Provider Layer	External integrations
Persistence Layer	Database operations
Rule

NEVER mix responsibilities across layers

3.2 Provider Isolation

Providers MUST be completely decoupled

No provider should know about another

No shared logic between providers unless abstracted

3.3 Config-Driven System

Routing rules MUST NOT be hardcoded

Credentials MUST NOT be hardcoded

Use:

Environment variables

Config files

Secrets management

3.4 Stateless Services

Services should be stateless where possible

State MUST be stored in:

Database

External systems

3.5 Idempotency Everywhere

ALL external-facing operations MUST be idempotent

Use:

Idempotency keys

Request hashing

DB uniqueness constraints

3.6 Observability-First Design

Every flow MUST be observable.

REQUIRED

Structured logging (JSON)

Include:

transaction_id

provider

status

latency

4. DEVOPS & INFRA REQUIREMENTS
4.1 Docker

Every service MUST have a Dockerfile

Containers MUST be lightweight

Use multi-stage builds where possible

4.2 Kubernetes

Must support deployment via:

Deployments

Services

ConfigMaps

Secrets

4.3 CI/CD

Pipeline MUST:

Build application

Run tests

Build Docker image

Deploy to environment

5. TESTING REQUIREMENTS
MUST INCLUDE
Unit Tests

Business logic

Routing logic

Integration Tests

Provider adapters (especially PayU)

End-to-End Tests

Full payment flow:

Auth → Capture

Auth → Void

Capture → Refund

6. PAYU-SPECIFIC RULES (IMPORTANT)

PayU is the reference implementation

DO NOT:

Simplify it

Abstract prematurely

DO:

Replicate its patterns for new providers

7. ANTI-PATTERNS (DO NOT DO)

❌ Hardcoding routing logic
❌ Mixing provider logic into services
❌ Skipping idempotency
❌ Ignoring callbacks
❌ Writing tightly coupled code
❌ Bypassing the routing layer

8. CODE GENERATION RULES FOR COPILOT

When generating code, ALWAYS:

Follow layered architecture

Use interfaces for providers

Keep functions small and single-purpose

Include error handling

Include logging

Respect existing patterns (especially PayU)

9. SUCCESS CRITERIA

The system is considered correct when:

PayU flows work end-to-end (already achieved)

Additional providers can be added with minimal changes

Routing logic works dynamically

Failover works correctly

System is fully observable

CI/CD deploys successfully

10. FINAL RULE

If unsure:
→ Follow the PayU implementation pattern
→ Do NOT invent new architecture styles