// Cube Community's SDK for applications on its hosting (https://cube.community/developers/hosting/secrets). Nothing to configure: the
// machine's identity and the address of its project's services come from the node's metadata service.
import { Secrets } from './secrets.js'

export { Metadata, MetadataError, type Vault } from './metadata.js'
export { Secrets, SecretNotFoundError, VaultError } from './secrets.js'

/** The project's secrets, read with this machine's identity: `await secrets.get('mail/api-key')`. */
export const secrets = new Secrets()
