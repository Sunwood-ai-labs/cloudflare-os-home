// Project-specific Env/ctx.exports augmentation for Wrangler's generated types.

declare namespace Cloudflare {
  interface Env {
    BASE_URL?: string;
    MCP_ALLOW_INSECURE?: string;
    MCP_CLIENT_NAME?: string;
    // Local-only experiment: enable the sample cross-customer hard-block rule.
    CFOS_EXPERIMENTAL_MCP_BLOCK_CROSS_CUSTOMER?: string;
  }

  interface GlobalProps {
    mainModule: typeof import("./mcp.js");
    durableNamespaces: "McpAccount" | "McpGatekeeperImpl";
  }
}

interface Env extends Cloudflare.Env {}
