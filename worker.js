/**
 * Cloudflare Worker - MCP Proxy per ClickUp
 *
 * Questo worker fa da proxy tra il tuo client MCP e ClickUp,
 * gestendo automaticamente l'autenticazione OAuth.
 */

const CLICKUP_MCP_URL = 'https://mcp.clickup.com/mcp';
const CLICKUP_TOKEN_URL = 'https://api.clickup.com/api/v2/oauth/token';
const CLICKUP_AUTH_URL = 'https://app.clickup.com/api';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers per permettere richieste da qualsiasi origine
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ========== OAUTH SETUP ENDPOINTS ==========

    // GET /oauth/start - Avvia il flusso OAuth
    if (url.pathname === '/oauth/start' && request.method === 'GET') {
      return handleOAuthStart(request, env);
    }

    // GET /oauth/callback - Riceve il callback da ClickUp
    if (url.pathname === '/oauth/callback' && request.method === 'GET') {
      return handleOAuthCallback(request, env);
    }

    // GET / - Homepage con istruzioni
    if (url.pathname === '/' && request.method === 'GET') {
      return handleHomepage(env);
    }

    // ========== MCP PROXY (richiede autenticazione) ==========

    try {
      // Verifica API key per sicurezza
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey || apiKey !== env.MCP_API_KEY) {
        return jsonResponse(
          { error: 'Unauthorized: Invalid or missing API key' },
          { status: 401, headers: corsHeaders }
        );
      }

      // ========== GESTIONE TOKEN OAUTH ==========
      let accessToken = env.CLICKUP_ACCESS_TOKEN;

      if (!accessToken) {
        return jsonResponse(
          {
            error: 'OAuth not configured',
            message: 'Visit /oauth/start to configure OAuth tokens'
          },
          { status: 503, headers: corsHeaders }
        );
      }

      // ========== PROXY MCP REQUEST ==========
      const body = await request.text();

      // Inoltra la richiesta a ClickUp MCP con il token OAuth
      const clickupResponse = await fetch(CLICKUP_MCP_URL, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: body,
      });

      // Se ricevi 401, il token è scaduto - prova a rinnovarlo
      if (clickupResponse.status === 401 && env.CLICKUP_REFRESH_TOKEN) {
        console.log('Token scaduto, rinnovo in corso...');

        const newToken = await refreshAccessToken(env);

        if (newToken) {
          // Salva il nuovo token (nota: in KV o usa Durable Objects per persistenza)
          // Per ora, riprova la richiesta con il nuovo token
          const retryResponse = await fetch(CLICKUP_MCP_URL, {
            method: request.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`,
            },
            body: body,
          });

          return proxyResponse(retryResponse, corsHeaders);
        }
      }

      return proxyResponse(clickupResponse, corsHeaders);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse(
        {
          error: 'Internal server error',
          message: error.message
        },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

/**
 * Rinnova l'access token usando il refresh token
 */
async function refreshAccessToken(env) {
  try {
    const response = await fetch(CLICKUP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.CLICKUP_CLIENT_ID,
        client_secret: env.CLICKUP_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: env.CLICKUP_REFRESH_TOKEN,
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    const data = await response.json();

    // TODO: Salvare il nuovo token in KV storage per persistenza
    // await env.TOKEN_STORE.put('CLICKUP_ACCESS_TOKEN', data.access_token);

    console.log('✅ Token rinnovato con successo');
    return data.access_token;

  } catch (error) {
    console.error('Refresh token error:', error);
    return null;
  }
}

/**
 * Crea una risposta JSON
 */
function jsonResponse(data, options = {}) {
  return new Response(JSON.stringify(data), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Inoltra la risposta di ClickUp al client
 */
async function proxyResponse(clickupResponse, corsHeaders) {
  const body = await clickupResponse.text();

  return new Response(body, {
    status: clickupResponse.status,
    statusText: clickupResponse.statusText,
    headers: {
      'Content-Type': clickupResponse.headers.get('Content-Type') || 'application/json',
      ...corsHeaders,
    },
  });
}

/**
 * Homepage con istruzioni
 */
function handleHomepage(env) {
  const hasTokens = env.CLICKUP_ACCESS_TOKEN && env.CLICKUP_CLIENT_ID;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>ClickUp MCP Proxy</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
    .status { padding: 15px; border-radius: 8px; margin: 20px 0; }
    .status.ok { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>🔐 ClickUp MCP Proxy</h1>

  <div class="status ${hasTokens ? 'ok' : 'error'}">
    <strong>Status:</strong> ${hasTokens ? '✅ OAuth configurato' : '❌ OAuth non configurato'}
  </div>

  ${!hasTokens ? `
    <h2>Setup iniziale richiesto</h2>
    <ol>
      <li>
        <strong>Crea app OAuth su ClickUp:</strong><br>
        Vai su <a href="https://app.clickup.com/settings/apps" target="_blank">ClickUp App Settings</a><br>
        Usa come Redirect URL: <code>${new URL('/oauth/callback', env.WORKER_URL || 'https://your-worker.workers.dev').toString()}</code>
      </li>
      <li>
        <strong>Salva Client ID e Secret:</strong><br>
        <pre>npx wrangler secret put CLICKUP_CLIENT_ID
npx wrangler secret put CLICKUP_CLIENT_SECRET</pre>
      </li>
      <li>
        <strong>Genera MCP API Key:</strong><br>
        <pre>npx wrangler secret put MCP_API_KEY</pre>
      </li>
      <li>
        <strong>Redeploy:</strong><br>
        <pre>npm run deploy</pre>
      </li>
      <li>
        <strong>Avvia OAuth:</strong><br>
        Visita <a href="/oauth/start">/oauth/start</a>
      </li>
    </ol>
  ` : `
    <h2>✅ Proxy attivo</h2>
    <p>MCP endpoint configurato correttamente.</p>
    <p>Usa questo URL nel tuo client MCP con header <code>X-API-Key</code>.</p>

    <h3>Configurazione Claude Code:</h3>
    <pre>{
  "mcpServers": {
    "clickup": {
      "url": "${env.WORKER_URL || request.url}",
      "headers": {
        "X-API-Key": "YOUR_MCP_API_KEY"
      }
    }
  }
}</pre>
  `}

  <hr>
  <p><small>Powered by Cloudflare Workers | <a href="https://github.com" target="_blank">GitHub</a></small></p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * Avvia il flusso OAuth (standard authorization code flow)
 */
async function handleOAuthStart(request, env) {
  if (!env.CLICKUP_CLIENT_ID) {
    return new Response('❌ CLICKUP_CLIENT_ID non configurato. Esegui: npx wrangler secret put CLICKUP_CLIENT_ID', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/oauth/callback`;

  // Costruisci URL di autorizzazione ClickUp (senza PKCE)
  const authUrl = new URL(CLICKUP_AUTH_URL);
  authUrl.searchParams.set('client_id', env.CLICKUP_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  // Redirect a ClickUp per autorizzazione
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString()
    }
  });
}

/**
 * Gestisce il callback OAuth da ClickUp
 */
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`❌ Errore OAuth: ${error}`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  if (!code) {
    return new Response('❌ Authorization code mancante', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Scambia il code per i token (senza PKCE)
  try {
    const tokenResponse = await fetch(CLICKUP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.CLICKUP_CLIENT_ID,
        client_secret: env.CLICKUP_CLIENT_SECRET,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return new Response(`❌ Token exchange failed: ${errorText}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const tokens = await tokenResponse.json();

    // Mostra i token all'utente
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>OAuth Success</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; user-select: all; }
    .token { background: #fff3cd; padding: 10px; margin: 10px 0; border-radius: 5px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="success">
    <h1>✅ OAuth completato con successo!</h1>
  </div>

  <h2>📝 Salva questi token come secrets:</h2>

  <h3>Access Token:</h3>
  <div class="token">${tokens.access_token}</div>

  ${tokens.refresh_token ? `
    <h3>Refresh Token:</h3>
    <div class="token">${tokens.refresh_token}</div>
  ` : ''}

  <h2>🔧 Comandi da eseguire:</h2>
  <pre>npx wrangler secret put CLICKUP_ACCESS_TOKEN
# Incolla: ${tokens.access_token}

${tokens.refresh_token ? `npx wrangler secret put CLICKUP_REFRESH_TOKEN
# Incolla: ${tokens.refresh_token}

` : ''}npx wrangler deploy</pre>

  <p>Dopo aver salvato i secrets e fatto redeploy, il proxy sarà operativo!</p>

  <p><a href="/">← Torna alla home</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html'
      }
    });

  } catch (error) {
    return new Response(`❌ Errore: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
