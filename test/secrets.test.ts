import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { Metadata, MetadataError, SecretNotFoundError, Secrets } from '../src/index.js'

// The SDK against stand-ins of the node's metadata service and of the projects' vault: discovery, login with the
// machine's JWT, the token kept and renewed, a secret read by its name.

const calls: string[] = []
const vaultState = { logins: 0, values: new Map([['mail/api-key', 'key-123']]), revoked: false }
let metadata: ReturnType<typeof Bun.serve>
let vault: ReturnType<typeof Bun.serve>

beforeAll(() => {
  vault = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async (request) => {
      const url = new URL(request.url)
      calls.push(`vault ${request.method} ${url.pathname} ns=${request.headers.get('x-vault-namespace')}`)
      if (url.pathname === '/v1/auth/workloads/login') {
        const body = await request.json() as { role: string, jwt: string }
        if (body.role !== 'machines' || body.jwt !== 'jwt-for-vault') return new Response('{"errors":["denied"]}', { status: 400 })
        vaultState.logins++
        vaultState.revoked = false
        return Response.json({ auth: { client_token: `token-${vaultState.logins}`, lease_duration: 900 } })
      }
      if (request.headers.get('x-vault-token') !== `token-${vaultState.logins}` || vaultState.revoked) return new Response('{"errors":["permission denied"]}', { status: 403 })
      const name = decodeURIComponent(url.pathname.replace('/v1/secret/data/', ''))
      const value = vaultState.values.get(name)
      return value === undefined ? new Response(null, { status: 404 }) : Response.json({ data: { data: { value } } })
    }
  })
  metadata = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) => {
      const url = new URL(request.url)
      calls.push(`metadata ${request.method} ${url.pathname}${url.search}`)
      if (url.pathname === '/v1/token') return new Response('session-token')
      if (request.headers.get('cc-metadata-token') !== 'session-token') return new Response('A session token is needed.', { status: 401 })
      if (url.pathname === '/v1/vault') return Response.json({ address: `http://127.0.0.1:${vault.port}`, namespace: 'prod/map-archive', role: 'machines', audience: 'vault.core.inside.cube.community' })
      if (url.pathname === '/v1/identity/jwt' && url.searchParams.get('audience') === 'vault.core.inside.cube.community') return new Response('jwt-for-vault')
      return new Response('Not found.', { status: 404 })
    }
  })
})
afterAll(() => {
  metadata.stop(true)
  vault.stop(true)
})
beforeEach(() => {
  calls.length = 0
  Object.assign(vaultState, { logins: 0, revoked: false })
})

const client = () => new Secrets(new Metadata(`http://127.0.0.1:${metadata.port}`))

describe('secrets', () => {
  test('read by name with nothing configured: discovery, the JWT for the vault\'s audience, login, then the value', async () => {
    const secrets = client()
    expect(await secrets.get('mail/api-key')).toBe('key-123')
    expect(calls.filter((c) => c.startsWith('metadata')).map((c) => c.split(' ').slice(2).join(' '))).toEqual(['/v1/token', '/v1/vault', '/v1/token', '/v1/identity/jwt?audience=vault.core.inside.cube.community'])
    expect(calls.filter((c) => c.startsWith('vault'))).toEqual([
      'vault POST /v1/auth/workloads/login ns=prod/map-archive',
      'vault GET /v1/secret/data/mail/api-key ns=prod/map-archive'
    ])
  })

  test('the token kept between reads, and a revoked one replaced once', async () => {
    const secrets = client()
    await secrets.get('mail/api-key')
    await secrets.get('mail/api-key')
    expect(vaultState.logins).toBe(1)
    vaultState.revoked = true
    expect(await secrets.get('mail/api-key')).toBe('key-123')
    expect(vaultState.logins).toBe(2)
  })

  test('a missing secret and an unreachable metadata service say so', async () => {
    await expect(client().get('nope')).rejects.toBeInstanceOf(SecretNotFoundError)
    await expect(new Secrets(new Metadata('http://127.0.0.1:1')).get('mail/api-key')).rejects.toBeInstanceOf(MetadataError)
  })
})
