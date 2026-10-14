# Releasing

Conventional commits on `master` drive versions for three components. [Release Please](https://github.com/googleapis/release-please) opens one release pull request. Merging that pull request tags the release. The [Release](../.github/workflows/release.yml) workflow then publishes packages and moves the Action major tag.

The site at `wsc.theserverless.dev` stays on Cloudflare Workers Builds. This workflow does not deploy it.

## Components

| Component | Path | Release type | Tag |
|-----------|------|--------------|-----|
| GitHub Action | repository root | `simple` | `v1.2.3` |
| `wsc-mcp` | `mcp-server/` | `node` | `wsc-mcp-v2.2.3` |
| `wsc-lint` | `cli/` | `node` | `wsc-lint-v1.3.1` |

Seed versions in `.release-please-manifest.json`: Action `1.2.1` (tag `v1.2.1`), `wsc-mcp` `2.2.2`, `wsc-lint` `1.3.0`.

The Action uses release type `simple`. Release Please writes `CHANGELOG.md` for it and does not edit the site `package.json`. That file is the private `writing-detector` app (`1.0.0`), not the Action version. The Action version lives in git tags.

`wsc-mcp` and `wsc-lint` use the `node` release type. Release Please bumps `package.json` and `package-lock.json`. For `wsc-mcp` it also bumps both version fields in `mcp-server/server.json`, which the MCP registry reads.

## Which commits count

`feat` bumps the minor version. `fix` bumps the patch version. A `BREAKING CHANGE` footer bumps the major version. Other conventional types (`ci`, `docs`, `chore`, `test`, `build`, `refactor`, `style`, `perf`, `revert`) also open a patch release when they touch a component. Release Please treats any conventional commit since the last tag as a release.

A commit counts for a component when it touches that component's path.

- A commit that only touches `mcp-server/` releases `wsc-mcp`.
- A commit that only touches `cli/` releases `wsc-lint`.
- The Action component ignores a commit when every file in it sits under an excluded directory: `mcp-server`, `cli`, `docs`, `.github`, `src/lib`, `src/routes`, `src/docs`, `src/styles`, `src/mcp`, `static`, or `tests`. A site-only commit, a docs-only commit, or a workflow-only commit does not cut an Action release.
- A commit that touches `action.yml`, `action/`, `src/core/`, or any other path outside that list releases the Action.

`src/core/` ships inside both npm packages (their TypeScript builds compile it) and inside the Action (the Action builds `wsc-lint` from the tagged commit). Release Please only attaches a commit to `wsc-mcp` or `wsc-lint` when the commit also touches that package directory. To ship a core fix in a package, include a file under `mcp-server/` or `cli/` in the same commit. A core-only commit releases the Action and moves `v1` after merge, which updates the Action's copy of the core.

## Release pull request

Push the commit to `master`. The Release workflow runs Release Please. When a component has releasable commits, Release Please opens a pull request that updates the manifest, changelogs, and package versions.

Review that pull request. Merge it when the notes look right. Do not tag or publish by hand.

Keep this automation commit, and any later commit you do not want to release, free of a conventional type prefix. A subject such as `ci: ...` on a root path opens an Action release pull request, and closing that pull request does not stick: the next run opens it again.

## What happens on merge

The merge pushes `master` and the workflow runs again.

1. Release Please creates the GitHub release and the component tag (`v1.2.3`, `wsc-mcp-vX.Y.Z`, or `wsc-lint-vX.Y.Z`).
2. When `mcp-server--release_created` is `true`, the workflow builds and smoke-tests `wsc-mcp` the same way CI does, then runs `npm publish --provenance --access public`.
3. When `cli--release_created` is `true`, the workflow does the same for `wsc-lint`.
4. When the root output `release_created` is `true`, the workflow force-moves tag `v1` to that release commit. `theserverlessdev/wsc@v1` follows the latest `v1.x.y` Action release. The bot writes an annotated tag and does not SSH-sign it.
5. After the `wsc-mcp` npm publish succeeds, the workflow calls [Publish to MCP Registry](../.github/workflows/publish-mcp.yml).

Publish jobs use npm trusted publishing (OIDC). They request `id-token: write`, install npm `>= 11.5.1` on Node 22, and set the npm registry URL. They do not use `NPM_TOKEN`.

### `v1` and the registry tag

`GITHUB_TOKEN` can create tags, and those tags do not start other workflows. Release Please's `wsc-mcp-v*` tag therefore does not start the registry workflow by itself. The Release workflow calls that workflow with `workflow_call` after npm publish. The registry workflow still has its `wsc-mcp-v*` tag trigger and `workflow_dispatch`, so a tag you push with your own credentials still publishes.

The `v1` move also uses `GITHUB_TOKEN` with `contents: write`. Repository rules must allow the Actions bot to update the `v1` tag.

## npm trusted publisher setup

Do this once on npmjs.com for `wsc-mcp` and again for `wsc-lint`, before the first automated publish. Each new publisher must complete a successful publish within 2 days or the config expires.

1. Open the package on npmjs.com, then **Settings**, then **Trusted Publisher**.
2. Choose **GitHub Actions**.
3. GitHub org or user: `theserverlessdev`
4. Repository: `wsc`
5. Workflow filename: `release.yml` (the file name only, not the path)
6. Leave **Environment name** empty. The Release workflow does not use a GitHub environment.
7. Allow direct `npm publish`. Publishers created after 3 Sep 2026 start with staged publish only, and this workflow runs `npm publish`, not `npm stage publish`.

Provenance needs `repository.url` in each published `package.json` to point at this repository, plus `directory` for the package folder:

- `mcp-server/package.json`: `git+https://github.com/theserverlessdev/wsc.git` and `"directory": "mcp-server"`
- `cli/package.json`: the same URL and `"directory": "cli"`

The private root `package.json` carries the same repository URL and no `directory`.

## Health Check

GitHub turned off the Health Check workflow after 60 days without repository activity. [Keepalive](../.github/workflows/keepalive.yml) enables Health Check on each push to `master`, and once a week it writes an empty commit on the `keepalive` branch so the 60-day clock resets.

If GitHub still shows Health Check as off after this lands, re-enable it once. This command does not delete or rewrite anything:

```bash
gh workflow enable "Health Check"
```
