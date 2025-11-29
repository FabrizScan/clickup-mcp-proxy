/**
 * Script per ottenere i token OAuth da ClickUp
 * Esegui questo script UNA VOLTA per ottenere access_token e refresh_token
 * Poi salva i token come secrets in Cloudflare
 */

import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';

// ========== CONFIGURAZIONE ==========
const CLIENT_ID = 'YOUR_CLICKUP_CLIENT_ID'; // Ottieni da ClickUp App Dashboard
const CLIENT_SECRET = 'YOUR_CLICKUP_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/callback';
const PORT = 3000;

// ====================================

// Genera PKCE code verifier e challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

// Avvia il server locale per ricevere il callback
async function startOAuthFlow() {
  const { verifier, challenge } = generatePKCE();

  console.log('🔐 Avvio flusso OAuth 2.1 con PKCE...\n');

  // Crea authorization URL
  const authUrl = new URL('https://app.clickup.com/api');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('📋 Apri questo URL nel browser:\n');
  console.log(authUrl.toString());
  console.log('\n🔄 Aspetto il callback...\n');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>❌ Errore: nessun code ricevuto</h1>');
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Autorizzazione ricevuta!</h1><p>Torna al terminale.</p>');

        // Scambia il code per i token
        try {
          const tokens = await exchangeCodeForTokens(code, verifier);
          server.close();
          resolve(tokens);
        } catch (error) {
          server.close();
          reject(error);
        }
      }
    });

    server.listen(PORT, () => {
      console.log(`🌐 Server locale in ascolto su http://localhost:${PORT}`);
    });
  });
}

// Scambia authorization code per access token
async function exchangeCodeForTokens(code, verifier) {
  console.log('🔄 Scambio authorization code per token...\n');

  const response = await fetch('https://app.clickup.com/api/v2/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  return data;
}

// Main
(async () => {
  try {
    // Verifica configurazione
    if (CLIENT_ID === 'YOUR_CLICKUP_CLIENT_ID') {
      console.error('❌ Errore: devi configurare CLIENT_ID e CLIENT_SECRET');
      console.error('📝 Crea una app OAuth su https://app.clickup.com/settings/apps');
      process.exit(1);
    }

    const tokens = await startOAuthFlow();

    console.log('\n✅ Token ottenuti con successo!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Salva questi valori come secrets in Cloudflare:\n');
    console.log(`Access Token:\n${tokens.access_token}\n`);

    if (tokens.refresh_token) {
      console.log(`Refresh Token:\n${tokens.refresh_token}\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔧 Comandi per salvare i secrets:\n');
    console.log(`npx wrangler secret put CLICKUP_ACCESS_TOKEN`);
    console.log(`npx wrangler secret put CLICKUP_REFRESH_TOKEN`);
    console.log(`npx wrangler secret put CLICKUP_CLIENT_ID`);
    console.log(`npx wrangler secret put CLICKUP_CLIENT_SECRET`);
    console.log(`npx wrangler secret put MCP_API_KEY\n`);

  } catch (error) {
    console.error('\n❌ Errore:', error.message);
    process.exit(1);
  }
})();
