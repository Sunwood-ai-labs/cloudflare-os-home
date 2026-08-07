// Shared registry-derived helpers used by both approvals.ts (revert snapshotting + action
// description) and simulation.ts (overlay indexing). Kept in its own module to avoid the
// approvals → simulation import cycle that would otherwise be necessary, and to make it
// obvious that these helpers are pure read-only views over a RegistrySnapshot.

import type { HATarget } from "./homeassistant";
import type { RegistrySnapshot } from "./homeassistant-api";

function asArray(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Resolve an HA service-call target into the set of concrete entity_ids it affects, walking
 * the area / device / label / floor relationships in the given registry snapshot. */
export function resolveTargets(
  target: HATarget | undefined,
  registry: RegistrySnapshot,
): Set<string> {
  const out = new Set<string>();
  if (!target) return out;

  for (const id of asArray(target.entity_id)) out.add(id);

  for (const did of asArray(target.device_id)) {
    for (const e of registry.entities as any[]) {
      if (e.device_id === did) out.add(e.entity_id);
    }
  }

  for (const aid of asArray(target.area_id)) {
    const deviceIds = new Set(
      (registry.devices as any[]).filter((d: any) => d.area_id === aid).map((d: any) => d.id),
    );
    for (const e of registry.entities as any[]) {
      if (e.area_id === aid || (e.device_id && deviceIds.has(e.device_id))) {
        out.add(e.entity_id);
      }
    }
  }

  for (const lid of asArray(target.label_id)) {
    for (const e of registry.entities as any[]) {
      if (Array.isArray(e.labels) && e.labels.includes(lid)) out.add(e.entity_id);
    }
  }

  for (const fid of asArray(target.floor_id)) {
    const areaIds = new Set(
      (registry.areas as any[]).filter((a: any) => a.floor_id === fid).map((a: any) => a.area_id),
    );
    for (const aid of areaIds) {
      const deviceIds = new Set(
        (registry.devices as any[]).filter((d: any) => d.area_id === aid).map((d: any) => d.id),
      );
      for (const e of registry.entities as any[]) {
        if (e.area_id === aid || (e.device_id && deviceIds.has(e.device_id))) {
          out.add(e.entity_id);
        }
      }
    }
  }

  return out;
}
