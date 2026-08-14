# Examples

Public-safe, reusable examples for Cloudflare OS Home.

Each example keeps the input, expected result, source locations, and known limitations together. Examples are designed for synthetic or local data only; credentials, customer data, tailnet-only endpoints, and publication tracking are intentionally excluded.

## Available examples

### Gatekeeper: cross-customer write block

Path: [gatekeeper-cross-customer-block](gatekeeper-cross-customer-block/)

An opt-in local experiment that blocks a custom MCP `add_task` write when the request mentions both Customer A and Customer B together with a send/share operation.

- [English guide](gatekeeper-cross-customer-block/README.md)
- [日本語ガイド](gatekeeper-cross-customer-block/README.ja.md)
- [Blocked request fixture](gatekeeper-cross-customer-block/fixtures/blocked-add-task.json)
- [Allowed request fixture](gatekeeper-cross-customer-block/fixtures/allowed-add-task.json)
- [Expected Monitor event](gatekeeper-cross-customer-block/fixtures/expected-monitor-event.json)

Status: verified in the local Cloudflare OS Home experiment branch. This is not a generic policy engine or a Cloudflare-managed feature.

### Agentic Gadget smoke test

The existing [Agent smoke test](../qa/agentic-gadget-smoke.mjs) asks the local workspace to create a minimal Gadget, run code, and report the result. It is useful as a first end-to-end check after booting the stack.

## Adding an example

Keep each example small and safe to copy:

1. Describe the scenario and prerequisites.
2. Add synthetic input fixtures when a request needs to be repeated.
3. State the observed result and the limitation separately.
4. Point to the implementation and the local verification path.

Do not place secrets, real customer records, private endpoints, or publication-tracking metadata in this directory.
