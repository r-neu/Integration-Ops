# Data Sources

This project uses real sample business records and simulated recovery events.

## Salesforce Easy Spaces Sample Data

- Source: https://github.com/trailheadapps/easy-spaces-lwc
- Pinned commit: `cf695b126408e4eb92439292c5c8725b7a94ee7a`
- License: CC0-1.0
- Files used: Accounts, Contacts, Leads, Markets, Spaces, and Reservations
- Processed record count: 180

Easy Spaces is Salesforce's sample event-management app. In this demo, Easy Spaces is also the customer tenant. Its Salesforce Accounts, Contacts, Spaces, and Reservations are treated as records inside that customer account.

The preparation script:

- keeps the raw files in the repository
- trims whitespace and converts empty strings to `null`
- keeps original phone values and adds normalized E.164 values
- resolves Contact-Account, Space-Market, and Reservation-Contact references
- writes a data-quality report with the transformation counts

## Pinned File Hashes

| File | SHA-256 |
| --- | --- |
| `Accounts.json` | `b02e8e0604ca8c21f89abb187c1aa9e2f92c681210754a3764f5a63969e214ee` |
| `Contacts.json` | `7790e45f229c9eb13488352870b5f9736f605dfccb6a10de50c649d51ff4fc28` |
| `Leads.json` | `f7a1ecf4b5af41979022337df91c269a02f07626d21d85214bf02e53165c4166` |
| `Markets.json` | `abb48b20c3e9e7ce18c635540f8d42d876cf887de84df3006ba91b19dc3dadba` |
| `Spaces.json` | `fd44f9688578a222b11b7ab87a63e6a9f77b6818bc76954d87d13dc47c297737` |
| `Reservations.json` | `185e81f6fc7f08727e173f6a348abf360bcd6a4db2bffca6ab3a03b17b367bdc` |
| `LICENSE` | `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499` |

## Provider Behavior

The demo does not need a second CRM dataset. The important part is the operational behavior around the customer records, so the failure events are modeled from public provider behavior instead.

### HubSpot

- Public API specs: https://github.com/HubSpot/HubSpot-public-api-spec-collection
- License: MIT
- Used for: OAuth and CRM contract reference

The expired-authorization path uses an `invalid_grant` response and stops before customer records are read.

### Slack

- Public API specs: https://github.com/slackapi/slack-api-specs
- License: MIT
- `files.upload` sunset notice: https://docs.slack.dev/changelog/2024-04-a-better-way-to-upload-files-is-here-to-stay/

The provider-change path is based on Slack's retirement of `files.upload` on November 12, 2025. The connector patch replaces it with:

1. `files.getUploadURLExternal`
2. uploading bytes to the returned URL
3. `files.completeUploadExternal`

### Google Sheets

- Append endpoint: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
- Usage limits: https://developers.google.com/workspace/sheets/api/limits

The rate-limit path uses HTTP 429 `RESOURCE_EXHAUSTED` and truncated exponential backoff with jitter, following Google's published guidance.

## Labels In The App

Rows shown in the incident evidence table are labeled as:

- **Open sample data:** the row comes from the pinned Salesforce sample data
- **Provider contract:** the row represents public provider behavior, such as the Slack endpoint retirement
- **Demo event:** the value was created for this replayable demo run

The mapping release matrix uses two Reservation rows from the sample data and four destination contract cases. Passing that matrix means the release gate is satisfied inside the demo; it is not production traffic.

## Simulated Events

These parts are simulated so the demo can be replayed:

- OAuth expiration and callback
- provider HTTP responses
- incident detection and classification times
- retry scheduling and worker progress
- connector deployment and monitoring
- activity logs and dashboard metrics

The demo records state changes inside an isolated Cloudflare D1 run. It does not call live third-party accounts or modify the pinned raw data.
