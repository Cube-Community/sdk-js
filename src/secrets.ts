import { Metadata, type Vault } from './metadata.js'

// A project's secrets (https://cube.community/developers/hosting/secrets): set from its page on Cube Community, read here from the
// projects' vault with this machine's identity. Logged in once, again shortly before the vault's token expires.

export class SecretNotFoundError extends Error {
  constructor(readonly secret: string) {
    super(`No secret named ${secret} in this project.`)
  }
}

export class VaultError extends Error {
  constructor(readonly status: number, message: string) {
    super(status ? `The vault answered ${status}: ${message}` : `The vault could not be reached: ${message}`)
  }
}

export class Secrets {
  private vault: Vault | null = null
  private session: { token: string, until: number } | null = null

  constructor(private readonly metadata = new Metadata(), private readonly fetcher: typeof fetch = fetch) {}

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const vault = this.vault ??= await this.metadata.vault()
    return this.fetcher(`${vault.address}/v1/${path}`, { ...init, headers: { 'X-Vault-Namespace': vault.namespace, ...init.headers } })
      .catch((error: unknown) => { throw new VaultError(0, error instanceof Error ? error.message : String(error)) })
  }

  private async token(): Promise<string> {
    if (this.session && Date.now() < this.session.until) return this.session.token
    const vault = this.vault ??= await this.metadata.vault()
    const jwt = await this.metadata.identityToken(vault.audience)
    const response = await this.call('auth/workloads/login', { method: 'POST', body: JSON.stringify({ role: vault.role, jwt }) })
    if (!response.ok) throw new VaultError(response.status, await response.text())
    const { auth } = await response.json() as { auth: { client_token: string, lease_duration: number } }
    this.session = { token: auth.client_token, until: Date.now() + Math.max(auth.lease_duration - 60, 10) * 1000 }
    return this.session.token
  }

  /** The current value of the secret `name` (as named on the project's page: `mail/api-key`, `DATABASE_URL`). */
  async get(name: string): Promise<string> {
    const path = name.split('/').map(encodeURIComponent).join('/')
    let response = await this.call(`secret/data/${path}`, { headers: { 'X-Vault-Token': await this.token() } })
    // A token the vault no longer knows (restarted, revoked): logged in again once.
    if (response.status === 403) {
      this.session = null
      response = await this.call(`secret/data/${path}`, { headers: { 'X-Vault-Token': await this.token() } })
    }
    if (response.status === 404) throw new SecretNotFoundError(name)
    if (!response.ok) throw new VaultError(response.status, await response.text())
    const body = await response.json() as { data: { data: { value: string } } }
    return body.data.data.value
  }
}
