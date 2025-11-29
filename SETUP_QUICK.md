# Setup Rapido - ClickUp MCP Proxy

Guida veloce per deployare il proxy in 5 minuti.

## Comandi da eseguire

```bash
# 1. Installa dipendenze
npm install

# 2. Login Cloudflare
npx wrangler login

# 3. Deploy iniziale
npm run deploy
# 📝 Copia l'URL del worker mostrato!
```

## Configurazione OAuth

### 1. Crea app su ClickUp

- Vai su https://app.clickup.com/settings/apps
- "Create an App"
- **Redirect URL**: `https://TUO-WORKER.workers.dev/oauth/callback`
- Copia Client ID e Client Secret

### 2. Salva secrets in Cloudflare

```bash
# Incolla i valori quando richiesto

npx wrangler secret put CLICKUP_CLIENT_ID
npx wrangler secret put CLICKUP_CLIENT_SECRET
npx wrangler secret put MCP_API_KEY

# Redeploy
npm run deploy
```

### 3. Completa OAuth via browser

1. Apri: `https://TUO-WORKER.workers.dev/oauth/start`
2. Autorizza su ClickUp
3. Copia i token mostrati nella pagina
4. Salva i token:

```bash
npx wrangler secret put CLICKUP_ACCESS_TOKEN
npx wrangler secret put CLICKUP_REFRESH_TOKEN

# Deploy finale
npm run deploy
```

## Usa con Claude Code

Aggiungi a `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clickup": {
      "url": "https://TUO-WORKER.workers.dev",
      "headers": {
        "X-API-Key": "TUA_MCP_API_KEY"
      }
    }
  }
}
```

**Fatto!**

Per dettagli completi vedi [README.md](./README.md)
