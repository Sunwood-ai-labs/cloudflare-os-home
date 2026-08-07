// Shared mechanics of an MCP gatekeeper facet. Connector-owned subclasses retain their Wrangler
// identity, props, labels, trust source, and account lookup.

import { DurableObject, type RpcStub } from "cloudflare:workers";
import type {
  ActionKind,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperUserVerifier,
  ResourceDescription,
} from "@gadgets/workshop-shared/gatekeeper";

import { ActionStore, REVERT_UNSUPPORTED_MESSAGE } from "./action-store.js";
import { CATALOG_TTL_MS, scopedTools } from "./catalog.js";
import type { McpClient } from "./client.js";
import {
  withClient,
  type ConnectionAccount,
  type ConnectionEnv,
  type WithClientOptions,
} from "./connection.js";
import type { McpLog } from "./log.js";
import { formatToolScope, type ToolScope } from "./scope.js";
import { McpSessionBase, type McpSessionHost, type StoredAction } from "./session.js";
import { installToolMethods } from "./session-methods.js";
import { observerRefusalMessage } from "./sharing-policy.js";
import { actionKindFor, type ClassifiedTool, type ServerTrust } from "./tools.js";

type FacetProps = {
  endpoint: string;
  scope: ToolScope;
};

type SessionConstructor<Session extends McpSessionBase> = new (
  host: McpSessionHost,
  queue: RpcStub<ApprovalQueue>,
) => Session;

/** Common session, catalog, action, and sharing behavior for connector-owned MCP facets. */
export abstract class McpFacetBase<
  Env extends ConnectionEnv,
  Props extends FacetProps,
  Session extends McpSessionBase,
> extends DurableObject<Env, Props> implements Gatekeeper<Session>, McpSessionHost {
  #toolsPromise: Promise<ClassifiedTool[]> | undefined;
  #toolsFetchedAt = 0;
  #toolsTrust: ServerTrust | undefined;
  #actionStore: ActionStore | undefined;

  #actions(): ActionStore {
    return this.#actionStore ??= new ActionStore(this.ctx.storage.sql);
  }

  /** Connector-owned logger carrying the facet's safe identifying fields. */
  protected abstract get log(): McpLog;

  /** Current trust tier, read whenever catalog classification is used. */
  protected abstract get trust(): ServerTrust;

  /** Connector-decorated session class exposed through RPC. */
  protected abstract get sessionClass(): SessionConstructor<Session>;

  /** Namespace preventing approval policy from crossing resource boundaries. */
  protected abstract get actionScopeTag(): string;

  /** Human-readable resource named when refusing an observer. */
  protected abstract get observerName(): string;

  /** Connector-owned account capability used for endpoint calls. */
  protected abstract account(): ConnectionAccount;

  /** Human-readable server label used in observations and action prompts. */
  abstract get serverName(): string;

  /** Describes the connector-specific resource represented by this facet. */
  abstract describe(): Promise<ResourceDescription>;

  /** Generates the connector-specific TypeScript API for this facet. */
  abstract getTypeScriptTypes(): Promise<string>;

  /** The endpoint this facet is authorized to call. */
  get endpoint(): string {
    return this.ctx.props.endpoint;
  }

  /** The tool scope this facet is authorized to expose. */
  get scope(): ToolScope {
    return this.ctx.props.scope;
  }

  /** Canonical resource URL for this facet's endpoint and scope. */
  protected get resourceUrl(): string {
    return formatToolScope(this.endpoint, this.scope);
  }

  /** Returns this facet's scoped and classified tool catalog. */
  tools(): Promise<ClassifiedTool[]> {
    const trust = this.trust;
    if (!this.#toolsPromise || this.#toolsTrust !== trust
        || Date.now() - this.#toolsFetchedAt > CATALOG_TTL_MS) {
      this.#toolsFetchedAt = Date.now();
      this.#toolsTrust = trust;
      this.#toolsPromise = scopedTools({
        store: this.ctx.storage.kv,
        log: this.log,
        env: this.env,
        account: this.account(),
        endpoint: this.endpoint,
        scope: this.scope,
        trust,
      }).catch(err => {
        this.#toolsPromise = undefined;
        throw err;
      });
    }
    return this.#toolsPromise;
  }

  /** Returns action kinds that this facet's current catalog permits auto-approving. */
  async getAutoApprovableActions(): Promise<ActionKind[]> {
    return (await this.tools())
      .filter(entry => entry.autoApprovable)
      .map(entry => actionKindFor(this.actionScopeTag, entry.tool.name));
  }

  /** Starts a session with generated per-tool methods when the catalog is available. */
  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<Session> {
    let SessionClass = this.sessionClass;
    try {
      SessionClass = installToolMethods(SessionClass, await this.tools());
    } catch (err) {
      this.log.warn("starting session without per-tool methods", {
        event: "session.tool-methods.unavailable", error: err,
      });
    }
    return new SessionClass(this, approvalQueue.dup());
  }

  /** Refuses observers so MCP bindings can only be opened by their owner. */
  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {
    throw new Error(observerRefusalMessage(this.observerName));
  }

  /** Removes no observer state because observers are never admitted. */
  async removeObserver(_id: string): Promise<void> {}

  /** Stages an MCP action for approval. */
  stageAction(toolName: string, args: Record<string, unknown>): StoredAction {
    return this.#actions().stage(toolName, args);
  }

  /** Discards an action whose approval submission failed. */
  discardStagedAction(id: number): void {
    this.#actions().discard(id);
  }

  /** Looks up a staged or completed action. */
  lookupAction(id: number): StoredAction | undefined {
    return this.#actions().get(id);
  }

  /** Applies an approved action without retrying an outcome-unknown write. */
  async applyAction(action: number): Promise<void> {
    await this.#actions().apply(
      action, fn => this.call(fn, { retryOnExpiry: false }), this.log);
  }

  /** Rejects a pending action. */
  async rejectAction(action: number): Promise<void> {
    this.#actions().reject(action);
  }

  /** Reports that MCP actions cannot be reverted. */
  async revertAction(_action: number): Promise<{ message: string }> {
    return { message: REVERT_UNSUPPORTED_MESSAGE };
  }

  /** Runs a call against this facet's endpoint and account. */
  call<T>(fn: (client: McpClient) => Promise<T>, options?: WithClientOptions): Promise<T> {
    return withClient(this.env, this.account(), this.endpoint, fn, options);
  }

  /** Namespaces one tool's approval kind to this facet. */
  actionKindFor(toolName: string): ActionKind {
    return actionKindFor(this.actionScopeTag, toolName);
  }
}
