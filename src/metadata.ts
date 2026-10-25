// The node's metadata service (https://cube.community/developers/hosting/workload-identity): this machine's identity, and where its
// project's services are, with nothing configured on the machine.

export type Vault = { address: string, namespace: string, role: string, audience: string }

export class MetadataError extends Error {
  constructor(readonly status: number, message: string) {
    super(status ? `The metadata service answered ${status}: ${message}` : `The metadata service could not be reached: ${message}`)
  }
}

export class Metadata {
  constructor(readonly address = 'http://169.254.169.254', private readonly fetcher: typeof fetch = fetch) {}

  private async get(path: string): Promise<string> {
    const session = await this.fetcher(`${this.address}/v1/token`, { method: 'PUT', headers: { 'CC-Metadata-Token-TTL-Seconds': '60' } })
      .catch((error: unknown) => { throw new MetadataError(0, error instanceof Error ? error.message : String(error)) })
    if (!session.ok) throw new MetadataError(session.status, await session.text())
    const response = await this.fetcher(`${this.address}${path}`, { headers: { 'CC-Metadata-Token': (await session.text()).trim() } })
    if (!response.ok) throw new MetadataError(response.status, (await response.text()).trim())
    return (await response.text()).trim()
  }

  /** This machine's identity for `audience`: a JWT valid 5 minutes. */
  identityToken(audience: string): Promise<string> {
    return this.get(`/v1/identity/jwt?audience=${encodeURIComponent(audience)}`)
  }

  /** Where its project's secrets are. */
  async vault(): Promise<Vault> {
    return JSON.parse(await this.get('/v1/vault')) as Vault
  }
}
