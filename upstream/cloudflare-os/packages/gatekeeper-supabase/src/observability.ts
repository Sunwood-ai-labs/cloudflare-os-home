import { createObservabilityContext } from "@gadgets/backend-utils/observability-context";

/** Observability fields emitted by the Supabase gatekeeper. */
export type SupabaseObservabilityFields = { vendorId: string };

/** Ambient observability fields for one Supabase gatekeeper operation. */
export const obsContext = createObservabilityContext<SupabaseObservabilityFields>();
