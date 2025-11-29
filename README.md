# ClickUp MCP Proxy

A transparent OAuth 2.1 + PKCE proxy server for ClickUp's official MCP server, built on Cloudflare Workers.

> **⚠️ Project Status**: Pending ClickUp MCP Server allowlist approval. [Request access here](https://forms.clickup-stg.com/333/f/ad-3426753/WF90UVNDA3H2GXA6TD).

## Overview

This proxy enables teams to share authenticated access to ClickUp's MCP server without requiring individual OAuth flows for each team member. The worker handles authentication centrally while maintaining security through API key protection and Cloudflare's secret management.

## Features

- ✅ **OAuth 2.1 + PKCE**: Implements the authentication flow required by ClickUp MCP
- ✅ **Transparent Proxy**: Forwards all MCP requests to ClickUp's official server
- ✅ **Team Access**: Single OAuth authentication, shared via API key
- ✅ **Serverless**: Runs on Cloudflare Workers (free tier supported)
- ✅ **Secure**: Tokens stored as encrypted secrets, never in code

## Architecture

```
MCP Client → Cloudflare Worker (Proxy) → ClickUp MCP Server
             ↓
         OAuth tokens in secrets
```

## Quick Start

### 1. Deploy

```bash
npm install
npx wrangler login
npm run deploy
```

### 2. Configure OAuth

1. Create OAuth app at https://app.clickup.com/settings/apps
2. Set redirect URL: `https://your-worker.workers.dev/oauth/callback`
3. Save credentials as secrets:

```bash
npx wrangler secret put CLICKUP_CLIENT_ID
npx wrangler secret put CLICKUP_CLIENT_SECRET
npx wrangler secret put MCP_API_KEY  # Generate with: openssl rand -hex 32
npm run deploy
```

### 3. Complete OAuth Flow

Visit `https://your-worker.workers.dev/oauth/start` to authorize, then save the returned token:

```bash
npx wrangler secret put CLICKUP_ACCESS_TOKEN
npm run deploy
```

## Usage

Configure your MCP client:

```json
{
  "mcpServers": {
    "clickup": {
      "url": "https://your-worker.workers.dev",
      "headers": {
        "X-API-Key": "your-api-key"
      }
    }
  }
}
```

## How It Works

1. **OAuth Handled Once**: Admin completes OAuth flow via browser
2. **Token Storage**: Access token stored as Cloudflare secret
3. **Proxy Requests**: Worker adds OAuth header and forwards to ClickUp MCP
4. **Team Access**: All team members use the proxy with a shared API key

## Security

- **Secrets Management**: OAuth tokens encrypted by Cloudflare
- **API Key Protection**: Only authorized users can access the proxy
- **HTTPS Only**: All traffic encrypted
- **No Token Exposure**: Tokens never appear in code or logs

## Technical Details

- **Protocol**: JSON-RPC 2.0 over HTTP (MCP specification compliant)
- **Authentication**: OAuth 2.1 with PKCE
- **Platform**: Cloudflare Workers
- **Runtime**: V8 isolates for secure execution

## OAuth Discovery

The official ClickUp MCP server implements OAuth 2.0 Authorization Server Metadata:

```
GET https://mcp.clickup.com/.well-known/oauth-authorization-server
```

## Project Structure

```
.
├── worker.js           # Cloudflare Worker with OAuth + MCP proxy
├── wrangler.toml       # Cloudflare configuration
├── package.json        # Dependencies
└── README.md           # Documentation
```

## Requirements

- Cloudflare account (free tier sufficient)
- ClickUp account with app creation permissions
- Node.js 18+ (for deployment)

## Costs

Cloudflare Workers free tier includes:
- 100,000 requests/day
- Sufficient for small to medium teams
- No cost for secrets storage

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Support

- ClickUp API: https://clickup.com/api
- MCP Specification: https://modelcontextprotocol.io/
- Issues: https://github.com/FabrizScan/clickup-mcp-proxy/issues

---

**Note**: This is an independent open-source project and is not officially affiliated with ClickUp.
