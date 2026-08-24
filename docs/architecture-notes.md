# Architecture Notes

The demo is small, but it uses the same kinds of boundaries I would want in a production integration operations product.

Each visitor gets a separate run ID. Workspace reads are read-only. State changes go through server actions that check the session role, reserve a command ID, and update related records in D1 batches.

The main state tables track incidents, job attempts, quarantine records, activity, customer updates, connector dependencies, exposure decisions, release targets, health-gate measurements, and support tasks.

The Slack path is the most technical part. The system does not mark every Slack tenant as affected. It evaluates registered workflow paths against connector family, version, capability, endpoint, enabled state, and metadata freshness. That keeps a message-only workflow out of the affected set even when another Slack workflow fails.

In production I would replace the browser-triggered demo worker with a queue-backed worker, add leases and dead-letter handling, move credentials into a dedicated secret store, and feed health gates from real telemetry. The current project keeps those pieces simulated, but the permission checks, state transitions, idempotency behavior, and rollout gates are implemented.
