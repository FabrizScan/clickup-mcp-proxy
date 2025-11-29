#!/bin/bash

# Script per testare il ClickUp MCP Proxy

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configurazione
WORKER_URL="${1:-}"
API_KEY="${2:-}"

if [ -z "$WORKER_URL" ] || [ -z "$API_KEY" ]; then
  echo -e "${RED}Uso: $0 <WORKER_URL> <API_KEY>${NC}"
  echo ""
  echo "Esempio:"
  echo "  $0 https://clickup-mcp-proxy.your-subdomain.workers.dev your-api-key"
  exit 1
fi

echo -e "${YELLOW}🔍 Testing ClickUp MCP Proxy...${NC}\n"

# Test 1: Homepage
echo -e "${YELLOW}Test 1: GET /${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Homepage: OK (200)${NC}\n"
else
  echo -e "${RED}❌ Homepage: FAIL (HTTP $HTTP_CODE)${NC}\n"
fi

# Test 2: MCP tools/list
echo -e "${YELLOW}Test 2: POST / (MCP tools/list)${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ MCP Request: OK (200)${NC}"
  echo -e "${GREEN}Response:${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  echo ""
else
  echo -e "${RED}❌ MCP Request: FAIL (HTTP $HTTP_CODE)${NC}"
  echo -e "${RED}Response:${NC}"
  echo "$BODY"
  echo ""
fi

# Test 3: Unauthorized (senza API key)
echo -e "${YELLOW}Test 3: POST / (senza API key - dovrebbe fallire)${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }')

if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✅ Auth Check: OK (401 Unauthorized)${NC}\n"
else
  echo -e "${RED}❌ Auth Check: FAIL (HTTP $HTTP_CODE, expected 401)${NC}\n"
fi

echo -e "${GREEN}Testing completato!${NC}"
