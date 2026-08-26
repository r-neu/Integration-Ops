# Integration Ops

Integration Ops is a portfolio project for recovering failed customer integrations.

A lot of integration demos stop at the setup flow: connect Salesforce, map a few fields, and send data somewhere else. I wanted to look at the messier part after launch: an integration is already live, something breaks, and the team has to recover without making the problem bigger.

The setup is a fictional B2B SaaS company supporting one customer, Easy Spaces. Easy Spaces connects Salesforce, HubSpot, Google Sheets, and Slack to a Customer 360-style product.

Live demo: https://ops-mvp.ran-yi-contact.workers.dev/access

## What To Try

Start at `/access`.

You can open the demo from three roles:

- **Support admin** sees customer impact and sends updates.
- **Customer admin** handles customer-owned steps, like CRM data approval and app reconnection.
- **Integration engineer** fixes mapping or connector issues and controls rollout.

There is also a guided walkthrough if you want to review the full incident from one place.

The demo includes five failure paths:

| Failure | Who acts first | What happens |
| --- | --- | --- |
| A Salesforce contact is missing a required value | Customer admin | Approve a scoped default or keep the records quarantined |
| HubSpot authorization expires | Customer admin | Reconnect the tenant account |
| A mapped Salesforce value is rejected downstream | Integration engineer | Publish a scoped mapping fix and retry |
| Google Sheets returns HTTP 429 | Platform | Wait for backoff and retry automatically |
| Slack retires a file upload endpoint | Integration engineer + Support | Patch the connector, deploy a canary, gate rollout, and keep rollback ready |

## Why I Built This

I built this because integration failures are rarely just technical errors. They create a coordination problem.

Support needs enough context to answer the customer. A customer admin may need to approve source data or reconnect an app. Engineering needs traces, mapping versions, and rollout controls before changing shared connector behavior.

I treated recovery as a shared incident view instead of a generic retry flow. The demo is organized around what happened, what can be done next, and which parts of the fix are customer-facing, data-facing, or connector-facing.

## Demo Flow

For a quick review, I would use this path:

1. Open `/access`.
2. Start the guided walkthrough.
3. Review the incident queue.
4. Open the Slack fleet recovery view.
5. Step through customer-owned fixes, engineering-owned fixes, automatic retries, customer updates, canary deployment, health gates, and rollback.

The guided walkthrough is useful for reviewing the whole system quickly. The role-based views are useful for checking that each person only sees the actions they should be able to take.

## How It Works

Each visitor gets a separate demo run stored in Cloudflare D1. Actions update real state for that run, so the demo can move through validation, retry, monitoring, release, rollback, and customer communication without sharing state across visitors.

A few implementation details worth looking at:

- Each visitor gets a separate demo run stored in D1, Cloudflare's serverless SQL database.
- D1-backed incident, job, and customer update state
- linked retry attempts with idempotency keys
- quarantine records for selective replay
- connector rollout by cohort with health gates and rollback
- Slack exposure checks based on registered workflow paths

The Slack incident is the shared-connector case. The system does not assume every Slack customer is affected. It checks which workflows actually use the retired upload method, excludes safe message-only paths, holds stale dependency data for review, and rolls out the fix through canary and cohort gates.

## Data Notes

The business records come from Salesforce's official Easy Spaces sample app under CC0-1.0.

I use simulated failure events around those records so the recovery paths are repeatable. The demo does not contact real Salesforce, HubSpot, Google Sheets, or Slack accounts.

The simulated failures are based on public provider behavior:

- HubSpot OAuth expiration
- Google Sheets HTTP 429 retry behavior
- Slack `files.upload` retirement and external upload replacement

More detail is in `data/SOURCES.md`.

## Tech Stack

React, TypeScript, Tailwind CSS, Vinext, Cloudflare Workers for the serverless backend, D1 for SQL storage, Drizzle, and Node tests.

## Run Locally

```bash
pnpm install
pnpm data:prepare
pnpm dev
```

## Verify

```bash
pnpm lint
pnpm test
```

The test suite is mostly there to protect the product rules: source-data integrity, role permissions, isolated runs, recovery transitions, retry behavior, fleet exposure, rollout, and route rendering.

Provider calls are simulated, but the state transitions, permissions, retries, and rollout gates are implemented.
