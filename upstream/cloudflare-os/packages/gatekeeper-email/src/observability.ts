import { createObservabilityContext } from "@gadgets/backend-utils/observability-context";

/** Observability fields emitted by the Email gatekeeper. */
export type EmailObservabilityFields = { vendorId: string };

/** Ambient observability fields for one Email gatekeeper operation. */
export const obsContext = createObservabilityContext<EmailObservabilityFields>();
