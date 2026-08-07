// Observer verification for Confluence bindings.
//
// Confluence permissions are not purely hierarchical: access to a site does not imply access to
// every space, access to a space does not imply access to every page, and a child page can be more
// restricted than its parent. All three binding granularities therefore use strategy C. A binding
// first verifies its coarse baseline (site, space, or content) and then uses
// ConfluenceObserverTracker to remember the narrower spaces/content whose data was actually
// revealed. Existing observations are checked when an observer joins; newly revealed resources
// are checked against observers already present.

import type { GatekeeperUserVerifier } from "@gadgets/workshop-shared/gatekeeper";
import {
  ConfluenceApi,
  ConfluenceApiError,
  getAccessibleResources,
  type AccessibleResource,
} from "./confluence-api";

/**
 * Private RPC surface minted from a collaborator's connected Confluence account.
 *
 * The Workshop treats a verifier as opaque and only returns it to the same vendor that minted it,
 * so Confluence gatekeepers may call these non-standard methods. Every method runs with the
 * prospective observer's OAuth credentials, never the binding owner's credentials.
 */
export interface ConfluenceVerifierApi extends GatekeeperUserVerifier {
  /** Whether the observer's token currently lists the requested Confluence Cloud site. */
  hasSiteAccess(cloudId: string): Promise<boolean>;

  /** Whether the observer can retrieve a space from the requested site by numeric ID or key. */
  hasSpaceAccess(cloudId: string, spaceIdOrKey: string): Promise<boolean>;

  /** Whether the observer can retrieve a page or blog post from the requested site. */
  hasContentAccess(cloudId: string, contentId: string): Promise<boolean>;
}

// The verifier deliberately receives only the three read operations needed to answer ACL
// questions. Keeping this structural type small also makes the access semantics easy to unit-test.
type AccessApi = Pick<ConfluenceApi, "getSpaceById" | "getSpaceByKey" | "getContentById">;

/**
 * Implements Confluence access checks independently of the WorkerEntrypoint wrapper.
 *
 * The injected token/API factories ensure every lookup uses the observer's account and make the
 * status handling testable without constructing a Cloudflare worker context. Checks are live: in
 * particular, site access does not trust the sites cached when the account was connected.
 */
export class ConfluenceAccessChecker {
  readonly #getToken: () => Promise<string>;
  readonly #getResources: (token: string) => Promise<AccessibleResource[]>;
  readonly #makeApi: (cloudId: string) => AccessApi;

  /**
   * Creates an access checker backed by one connected account.
   *
   * `makeApi` must construct an API client using the same account as `getToken`.
   * `getResources` is injectable only so the OAuth endpoint can be tested without network access.
   */
  constructor(
    getToken: () => Promise<string>,
    makeApi: (cloudId: string) => AccessApi,
    getResources: (token: string) => Promise<AccessibleResource[]> = getAccessibleResources,
  ) {
    this.#getToken = getToken;
    this.#makeApi = makeApi;
    this.#getResources = getResources;
  }

  /** Checks current site membership through Atlassian's live accessible-resources endpoint. */
  async hasSiteAccess(cloudId: string): Promise<boolean> {
    return this.#check(async () =>
      (await this.#getResources(await this.#getToken())).some(resource => resource.id === cloudId));
  }

  /**
   * Checks that a space can be retrieved from the specified site.
   *
   * Confluence resource URLs may identify a space by key or numeric ID, so the verifier preserves
   * the same interpretation used by the gatekeeper's public session API.
   */
  async hasSpaceAccess(cloudId: string, spaceIdOrKey: string): Promise<boolean> {
    return this.#check(async () => {
      const api = this.#makeApi(cloudId);
      if (/^\d+$/.test(spaceIdOrKey)) await api.getSpaceById(spaceIdOrKey);
      else await api.getSpaceByKey(spaceIdOrKey);
      return true;
    });
  }

  /** Checks that either the page or blog-post endpoint can retrieve a content ID. */
  async hasContentAccess(cloudId: string, contentId: string): Promise<boolean> {
    return this.#check(async () => {
      await this.#makeApi(cloudId).getContentById(contentId);
      return true;
    });
  }

  // Permission denial, missing resources, and invalid/revoked observer credentials all mean the
  // observer cannot be admitted. Operational failures are rethrown: silently converting a 5xx or
  // network outage to "no access" would hide a broken verifier and produce misleading denials.
  async #check(check: () => Promise<boolean>): Promise<boolean> {
    try {
      return await check();
    } catch (error) {
      if (error instanceof ConfluenceApiError &&
          (error.status === 401 || error.status === 403 || error.status === 404)) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * A resource revealed by an observation whose ACL must be checked independently.
 *
 * The prefix is part of the persisted key. It prevents a numeric space ID and content ID from
 * colliding and tells the tracker which verifier method to call after restoring the key.
 */
export type ConfluenceObservedSet = `space:${string}` | `content:${string}`;

// Minimal structural view of DurableObjectStorage.kv used by the tracker. The tracker owns keys
// under `observer:` and `observed:`; pending-action/cache keys in the same DO use other prefixes.
type ObserverKv = {
  get<T>(key: string): T | undefined;
  put<T>(key: string, value: T): void;
  delete(key: string): void;
  list<T>(options: { prefix: string }): Iterable<[string, T]>;
};

/** The result of checking observers before an observation is authorized. */
export type ConfluenceObservationCheck = {
  excludeObservers?: string[];
  pendingSets: ConfluenceObservedSet[];
  commit(): void;
};

type ObservedSetState = true | "pending" | "observed";

/**
 * Persists the strategy-C state for one Confluence gatekeeper DO.
 *
 * Storage contains two kinds of records:
 *
 * - `observed:space:<id>` / `observed:content:<id>` state for every independently protected
 *   resource whose observation is pending or complete.
 * - `observer:<opaque-id>` persistent verifier stubs for collaborators that passed all checks.
 *
 * The binding's baseline check is intentionally outside this class because it differs by DO type.
 * Site, space, and content gatekeepers perform that check first, then call addObserver() here to
 * validate historical sets and retain the verifier for forward exclusion.
 */
export class ConfluenceObserverTracker {
  readonly #kv: ObserverKv;
  readonly #cloudId: string;

  /** Creates a tracker over one gatekeeper DO's durable storage and bound Confluence site. */
  constructor(kv: ObserverKv, cloudId: string) {
    this.#kv = kv;
    this.#cloudId = cloudId;
  }

  /**
   * Verifies a prospective observer against every resource observed in the past, then remembers
   * their verifier for checks on future observations.
   *
   * The caller must already have checked the binding baseline. The verifier is written only after
   * all historical checks pass, so a rejected collaborator can never participate in forward
   * exclusion.
   */
  async addObserver(id: string, verifier: Fetcher<ConfluenceVerifierApi>): Promise<void> {
    const checked = new Set<ConfluenceObservedSet>();
    while (true) {
      const sets = this.#listTrackedSets().filter(setId => !checked.has(setId));
      if (sets.length === 0) {
        this.#kv.put(this.#observerKey(id), verifier);
        return;
      }
      const access = await Promise.all(sets.map(setId => this.#hasSetAccess(verifier, setId)));
      if (access.some(hasAccess => !hasAccess)) {
        throw new Error(
          "This collaborator does not have access to Confluence data this workspace has read, so they " +
          "cannot be allowed to observe it.");
      }
      for (const setId of sets) checked.add(setId);
    }
  }

  /** Forgets an observer's verifier. Deleting an absent key makes this operation idempotent. */
  removeObserver(id: string): void {
    this.#kv.delete(this.#observerKey(id));
  }

  /**
   * Marks resources pending and identifies observers who cannot see them.
   *
   * Observed sets require no work. Pending sets are rechecked on every attempt so failed
   * authorization cannot turn a retry into an unchecked read.
   */
  async prepareObservation(sets: ConfluenceObservedSet[]): Promise<ConfluenceObservationCheck> {
    const pendingSets = [...new Set(sets)].filter(setId => !this.#isObserved(setId));
    if (pendingSets.length === 0) return { pendingSets, commit() {} };

    // Publish pending state before the first await so a concurrently admitted observer must check it.
    for (const setId of pendingSets) {
      if (this.#state(setId) === undefined) this.#kv.put(this.#observedKey(setId), "pending");
    }

    const observerAccess = await Promise.all([...this.#listObservers()].map(async ([id, verifier]) => {
      const access = await Promise.all(pendingSets.map(setId => this.#hasSetAccess(verifier, setId)));
      return [id, access.every(hasAccess => hasAccess)] as const;
    }));
    const excluded = observerAccess.filter(([, hasAccess]) => !hasAccess).map(([id]) => id);
    return {
      excludeObservers: excluded.length > 0 ? excluded : undefined,
      pendingSets,
      commit: () => this.commitObservation(pendingSets),
    };
  }

  /** Promotes sets only after the overseer authorizes the observation that revealed them. */
  commitObservation(pendingSets: ConfluenceObservedSet[]): void {
    for (const setId of pendingSets) this.#kv.put(this.#observedKey(setId), "observed");
  }

  // Centralize the persisted key formats so writers and prefix scans cannot drift apart.
  #observerKey(id: string): string { return `observer:${id}`; }
  #observedKey(setId: ConfluenceObservedSet): string { return `observed:${setId}`; }

  /** Returns whether this DO has already accounted for the resource in observer checks. */
  #isObserved(setId: ConfluenceObservedSet): boolean {
    const state = this.#state(setId);
    return state === true || state === "observed";
  }

  #state(setId: ConfluenceObservedSet): ObservedSetState | undefined {
    return this.#kv.get<ObservedSetState>(this.#observedKey(setId));
  }

  /** Restores every typed observed-set ID from the DO's marker keys. */
  #listTrackedSets(): ConfluenceObservedSet[] {
    const prefix = "observed:";
    return [...this.#kv.list<ObservedSetState>({ prefix })]
      .map(([key]) => key.slice(prefix.length) as ConfluenceObservedSet);
  }

  /** Iterates opaque observer IDs and their persistent, vendor-specific verifier stubs. */
  *#listObservers(): IterableIterator<[string, Fetcher<ConfluenceVerifierApi>]> {
    const prefix = "observer:";
    for (const [key, verifier] of this.#kv.list<Fetcher<ConfluenceVerifierApi>>({ prefix })) {
      yield [key.slice(prefix.length), verifier];
    }
  }

  /** Dispatches a typed set to the matching live ACL check on the observer's verifier. */
  #hasSetAccess(
    verifier: Fetcher<ConfluenceVerifierApi>, setId: ConfluenceObservedSet,
  ): Promise<boolean> {
    const separator = setId.indexOf(":");
    const kind = setId.slice(0, separator);
    const resourceId = setId.slice(separator + 1);
    return kind === "space"
      ? verifier.hasSpaceAccess(this.#cloudId, resourceId)
      : verifier.hasContentAccess(this.#cloudId, resourceId);
  }
}

/**
 * Converts Confluence content IDs to typed observed sets, omitting unresolved provisional IDs.
 *
 * A `~` ID names content staged by this Gadget but not yet created in Confluence. Its simulated
 * data came from the Gadget itself, and there is no external ACL or real ID for a verifier to test.
 */
export function contentSets(ids: string[]): ConfluenceObservedSet[] {
  return ids.filter(id => !id.startsWith("~"))
    .map((id): ConfluenceObservedSet => `content:${id}`);
}

/** Converts Confluence's stable numeric space IDs to collision-safe observed-set keys. */
export function spaceSets(ids: string[]): ConfluenceObservedSet[] {
  return ids.map((id): ConfluenceObservedSet => `space:${id}`);
}
