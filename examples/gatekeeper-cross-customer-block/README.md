# Gatekeeper cross-customer write block

This example shows an opt-in local Gatekeeper rule for a synthetic cross-customer transfer request.

The rule is deliberately narrow:

- MCP server: `task-manager-streamable-http`
- MCP tool: `add_task`
- trigger: the string arguments contain Customer A, Customer B, and a send/share term
- result: the action is rejected before it is queued or forwarded to the MCP provider

This is a local experiment for Cloudflare OS Home. It is not a production authorization policy, a generic customer-boundary engine, or an official Cloudflare OS feature.

## Prerequisites

- A running Cloudflare OS Home checkout.
- A Streamable HTTP MCP server exposing `add_task`.
- The MCP server connected from the Admin Gatekeepers screen.
- Synthetic data only.

The separate minimal task MCP used during the original experiment is documented in the Lab repository. This example does not depend on a private local path; use any compatible MCP server with the server and tool names above.

## Enable the experiment

Set the opt-in flag in the root `.env` file:

```dotenv
CFOS_EXPERIMENTAL_MCP_BLOCK_CROSS_CUSTOMER=true
```

Then rebuild the local service:

```powershell
docker compose up --build -d cloudflare-os
```

The Compose file passes the flag into the Cloudflare OS service. The default is disabled.

## Run the blocked case

Use the values in [fixtures/blocked-add-task.json](fixtures/blocked-add-task.json) with the connected MCP `add_task` tool. The request should be rejected before the normal approval card is created.

Inspect Admin → Monitor and compare the event with [fixtures/expected-monitor-event.json](fixtures/expected-monitor-event.json). The important fields are:

- `action.blocked`
- outcome `rejected`
- policy code `cross-customer-destination`
- the Gatekeeper, actor, operation, resource, and action identifiers
- no change to the task MCP data

## Run the allowed case

Use [fixtures/allowed-add-task.json](fixtures/allowed-add-task.json). It does not contain the cross-customer send pattern, so this local rule returns control to the normal Gatekeeper behavior. The fixture is a comparison case, not a blanket allowlist.

## Implementation

- [Gatekeeper rule](../../upstream/cloudflare-os/packages/gatekeeper-mcp/src/mcp.ts)
- [Compose flag](../../docker-compose.yml)
- [Monitor UI](../../upstream/cloudflare-os/packages/workshop-frontend/src/components/GatekeeperMonitorPanel.tsx)
- [Experiment record](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)

## Limitations

The current rule is intentionally experimental and string-based. It is scoped to one MCP server and one tool, and it does not inspect structured customer IDs, recipient IDs, Workspace IDs, tenant ownership, or an allowlist. Do not use it as the only control for real customer data.

The next production-oriented step would be to pass structured destination and ownership attributes into the policy decision, then test allow, deny, audit, and multiple-tenant boundaries independently.
