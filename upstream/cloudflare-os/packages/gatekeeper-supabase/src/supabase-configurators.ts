import { RpcTarget } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import { SupabaseApi, type OrganizationResponse, type ProjectResponse } from "./supabase-api";
import type { SupabaseOrganizationConfiguratorRpc } from "./configurator/supabase-organization-configurator-types";
import type { SupabaseProjectConfiguratorRpc } from "./configurator/supabase-project-configurator-types";

type ConfiguratorOption = { value: string; title: string; subtitle?: string; meta?: string };

const OPTION_LIMIT = 100;

// Token getters are held off the RpcTarget surface so they can't be reached over RPC.
const tokenGetters = new WeakMap<object, () => Promise<string>>();

// Supabase has no server-side project/org search, so we fetch the full list and filter locally.
// Cache the fetch per configurator instance so typing in the picker doesn't refetch on every
// keystroke. Keyed on the instance; cleared on failure so a transient error can be retried.
const projectListCache = new WeakMap<object, Promise<ProjectResponse[]>>();
const orgListCache = new WeakMap<object, Promise<OrganizationResponse[]>>();

function api(target: object): SupabaseApi {
  const getToken = tokenGetters.get(target);
  if (!getToken) throw new Error("Supabase configurator is not initialized.");
  return new SupabaseApi(getToken);
}

function cachedList<T>(
  target: object,
  cache: WeakMap<object, Promise<T[]>>,
  load: () => Promise<T[]>,
): Promise<T[]> {
  let pending = cache.get(target);
  if (!pending) {
    pending = load();
    cache.set(target, pending);
    pending.catch(() => cache.delete(target));
  }
  return pending;
}

function matches(parts: (string | undefined)[], query: string): boolean {
  const lower = query.trim().toLowerCase();
  if (!lower) return true;
  const corpus = parts.filter(Boolean).join(" ").toLowerCase();
  return lower.split(/\s+/).every(term => corpus.includes(term));
}

@validateRpc()
export class SupabaseProjectConfiguratorUI extends RpcTarget implements SupabaseProjectConfiguratorRpc {
  constructor(getToken: () => Promise<string>) {
    super();
    tokenGetters.set(this, getToken);
  }

  async listProjects(query: string): Promise<ConfiguratorOption[]> {
    const projects = await cachedList(this, projectListCache, () => api(this).listProjects());
    return projects
      .filter(project => matches([project.name, project.ref, project.region], query))
      .slice(0, OPTION_LIMIT)
      .map(project => ({
        value: project.ref,
        title: project.name,
        subtitle: `${project.organization_slug} · ${project.region}`,
        meta: project.ref,
      }));
  }
}

@validateRpc()
export class SupabaseOrganizationConfiguratorUI extends RpcTarget implements SupabaseOrganizationConfiguratorRpc {
  constructor(getToken: () => Promise<string>) {
    super();
    tokenGetters.set(this, getToken);
  }

  async listOrganizations(query: string): Promise<ConfiguratorOption[]> {
    const organizations = await cachedList(this, orgListCache, () => api(this).listOrganizations());
    return organizations
      .filter(org => matches([org.name, org.slug], query))
      .slice(0, OPTION_LIMIT)
      .map(org => ({
        value: org.slug,
        title: org.name,
        subtitle: org.slug,
      }));
  }
}
