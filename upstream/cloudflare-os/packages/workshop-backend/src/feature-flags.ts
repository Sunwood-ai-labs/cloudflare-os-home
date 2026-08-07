import {
  DEFAULT_UI_FEATURE_FLAGS,
  DEV_UI_FEATURE_FLAGS,
  UI_FEATURE_FLAGS,
  type UiFeatureFlagName,
  type UiFeatureFlags,
} from "@gadgets/workshop-shared/feature-flags";
import { createWorkshopLogger } from "./observability";

const logger = createWorkshopLogger("workshop.feature-flags");

type FeatureFlagEnv = {
  DEV?: boolean;
  FLAGS?: Pick<Flagship, "getBooleanValue">;
};

type UiFeatureFlagEntry = [UiFeatureFlagName, boolean];

export async function resolveUiFeatureFlags(
    env: FeatureFlagEnv,
    userId: string,
): Promise<UiFeatureFlags> {
  if (env.DEV) {
    return { ...DEV_UI_FEATURE_FLAGS };
  }

  const flags = env.FLAGS;
  if (!flags) {
    logger.warn("Flagship binding missing; using default values", {
      event: "feature-flags.binding.missing",
      operation: "feature-flags.resolve",
    });
    return { ...DEFAULT_UI_FEATURE_FLAGS };
  }

  const values: UiFeatureFlagEntry[] = await Promise.all(
    UI_FEATURE_FLAGS.map(async (flag): Promise<UiFeatureFlagEntry> => {
      try {
        return [flag.key, await flags.getBooleanValue(flag.key, flag.default, { userId })];
      } catch (error) {
        logger.warn("feature flag evaluation failed", {
          event: "feature-flags.evaluate.failed",
          operation: "feature-flags.evaluate",
          error,
        });
        return [flag.key, flag.default];
      }
    }),
  );

  return Object.fromEntries(values) as UiFeatureFlags;
}
