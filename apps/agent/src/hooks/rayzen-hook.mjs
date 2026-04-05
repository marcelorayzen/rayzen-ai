#!/usr/bin/env node
/**
 * Rayzen AI — Claude Code Hook
 *
 * Recebe o payload do hook via stdin e envia para POST /events/cli.
 * Configurar em ~/.claude/settings.json (ver docs/roadmap.md Fase 3).
 *
 * Prioridade de configuração:
 *   1. Variáveis de ambiente: RAYZEN_API_URL, RAYZEN_API_TOKEN, RAYZEN_PROJECT_ID
 *   2. Arquivo: apps/agent/src/hooks/hook.config.mjs (não commitado)
 */

import { request } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dir, 'hook.config.mjs')

async function loadConfig() {
  let cfg = {}
  if (existsSync(CONFIG_PATH)) {
    try {
      const mod = await import(CONFIG_PATH)
      cfg = mod.default ?? {}
    } catch { /* ignora */ }
  }
  return {
    apiUrl:    process.env.RAYZEN_API_URL    ?? cfg.apiUrl    ?? 'http://localhost:3001',
    apiToken:  process.env.RAYZEN_API_TOKEN  ?? cfg.apiToken  ?? '',
    projectId: process.env.RAYZEN_PROJECT_ID ?? cfg.projectId ?? '',
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    setTimeout(() => resolve(data), 3000)
  })
}

function post(url, body, token) {
  return new Promise((resolve) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? httpsRequest : request
    const payload = JSON.stringify(body)

    const req = lib({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })

    req.on('error', () => resolve(0))
    req.setTimeout(5000, () => { req.destroy(); resolve(0) })
    req.write(payload)
    req.end()
  })
}

async function main() {
  const [raw, cfg] = await Promise.all([readStdin(), loadConfig()])
  if (!raw.trim()) return

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    process.exit(0)
  }

  if (cfg.projectId) payload.projectId = cfg.projectId

  await post(`${cfg.apiUrl}/events/cli`, payload, cfg.apiToken)
  process.exit(0)
}

main().catch(() => process.exit(0))
