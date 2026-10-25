# @cube-community/sdk

The SDK for applications hosted by [Cube Community](https://cube.community): your project's machines read its
[secrets](https://cube.community/developers/hosting/secrets) with their own
[workload identity](https://cube.community/developers/hosting/workload-identity). Nothing to configure: the machine's
identity and the address of your project's services come from the node's metadata service (`169.254.169.254`).

```sh
npm install @cube-community/sdk
```

```ts
import { secrets } from '@cube-community/sdk'

const apiKey = await secrets.get('mail/api-key')
```

- `secrets.get(name)` returns the current value of the secret `name`, as named on your project's Secrets page. The SDK
  finds the vault and your project's namespace, logs in with the machine's identity, keeps its session and renews it;
  a session the vault no longer knows is replaced once.
- It throws `SecretNotFoundError` for an unknown name, `MetadataError` when not run on one of your project's machines
  (the metadata service only answers them), `VaultError` when the vault refuses or cannot be reached.
- No dependency: the `fetch` of Node.js 18 and later, Bun or Deno.

It only works on a Cube Community project's machine: elsewhere there is no metadata service to ask.

## More to come

One module per Cube Community service, as they come: projects, databases and the others.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build
```

A release is a tag `v<version>` matching `package.json`: the publish workflow builds and publishes it to npm with
provenance.

## License

MIT
