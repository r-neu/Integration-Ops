# Demo Guide

Start at `/access` and choose **Start guided review** for the fastest path.

1. Open **Incidents** and scan the five tenant incidents plus the Slack provider incident.
2. Open **Fleet recovery** and look at the Slack exposure table. Easy Spaces is affected, Northstar is exposed, Brightline is safely excluded, and Harbor is held until fresh dependency evidence is collected.
3. In the guided walkthrough, play the Google Sheets path first. It should recover automatically after backoff.
4. Play the Salesforce path. The customer-owned step approves the scoped default, then the platform validates and replays only the quarantined records.
5. Play the HubSpot path. The customer reconnects the tenant account, then the platform verifies the returned account and scope.
6. Play the mapping path. Engineering publishes the Draft to Planning mapping fix after sample and contract checks.
7. Play the Slack path. Support sends the customer update while Engineering tests the connector patch, deploys the canary, and promotes later cohorts only after health checks pass.
8. Open **Policy sandbox** and remove a required signal from a known policy. The result should move to manual review and block production action.

For role checks, return to `/access` and open the same run as Support admin, Customer admin, and Integration engineer. Each role should have enough context to act without seeing controls that belong to someone else.
