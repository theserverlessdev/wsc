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

The Action uses release type `simple`. Release Please writes `CHANGELOG.md` for it and leaves the site `package.json` untouched. That file is the private `writing-detector` app (`1.0.0`). The Action version lives in git tags.

`wsc-mcp` and `wsc-lint` use the `node` release type. Release Please bumps `package.json` and `package-lock.json`. For `wsc-mcp` it also bumps both version fields in `mcp-server/server.json`, which the MCP registry reads. The same `wsc-mcp` release bumps the version in `src/mcp/handler.ts`. That line carries the marker `x-release-please-version`. The extra-file path is `/src/mcp/handler.ts`. A leading slash means the repository root, so the edit lands on the remote MCP handler and not under `mcp-server/`.

## Which commits count

`feat` and `feature` bump the minor version. `fix`, `perf`, and `revert` bump the patch version. A breaking change bumps the major version. Mark one with `type!:` in the subject, or with a `BREAKING CHANGE` footer.

Release Please skips a component when the changelog notes are empty. These types produce notes: `feat`, `feature`, `fix`, `perf`, and `revert`. A breaking change produces notes on any type, including the hidden types below. These types produce no notes on their own: `docs`, `style`, `chore`, `refactor`, `test`, `build`, and `ci`. A `deps` commit sits outside that list. It produces notes when it is a breaking change, and it does not open a release otherwise.

A commit counts for a component when it touches that component's path.

- A commit that only touches `mcp-server/` releases `wsc-mcp`.
- A commit that only touches `cli/` releases `wsc-lint`.
- The Action component ignores a commit when every file in it sits under an excluded directory: `mcp-server`, `cli`, `docs`, `.github`, `src/lib`, `src/routes`, `src/docs`, `src/styles`, `src/mcp`, `static`, or `tests`. A site-only commit, a docs-only commit, or a workflow-only commit does not cut an Action release.
- A commit that touches `action.yml`, `action/`, `src/core/`, or any other path outside that list releases the Action.

`src/core/` ships inside both npm packages (their TypeScript builds compile it) and inside the Action (the Action builds `wsc-lint` from the tagged commit). Release Please attaches a commit to `wsc-mcp` or `wsc-lint` when the commit also touches that package directory. To ship a core fix in a package, include a file under `mcp-server/` or `cli/` in the same commit. A core-only commit releases the Action and moves the major tag after merge. While the Action major is 1, that tag is `v1`.

## Before the first automated release

Do these steps once. The workflow keeps `GITHUB_TOKEN`. It does not change repository settings.

### Allow Actions to open pull requests

Release Please opens the release pull request with `GITHUB_TOKEN`. GitHub blocks that token until the repository allows Actions to create and approve pull requests.

Turn the setting on under **Settings**, then **Actions**, then **General**. Enable **Allow GitHub Actions to create and approve pull requests**.

The same change from the API:

```bash
gh api -X PUT repos/theserverlessdev/wsc/actions/permissions/workflow \
  -F can_approve_pull_request_reviews=true \
  -f default_workflow_permissions=read
```

That call sets `can_approve_pull_request_reviews` and sets `default_workflow_permissions` to `read`. Use the Settings page to change the pull request checkbox on its own.

### Run CI on the release pull request

`GITHUB_TOKEN` opens the release pull request, and that pull request does not start CI or the writing check. Close the pull request and reopen it. Both workflows run on `reopened`. You can also start [CI](../.github/workflows/ci.yml) or the [writing check](../.github/workflows/writing.yml) with `workflow_dispatch` and select the release branch.

### App token

A GitHub App token can open the release pull request without the checkbox above. A tag push from that token starts other workflows. The Release workflow already calls [Publish to MCP Registry](../.github/workflows/publish-mcp.yml) after the npm publish, and that workflow still listens for `wsc-mcp-v*` tags. If you switch Release Please to an App token, remove the tag trigger. With the trigger left in place, the tag push and the `workflow_call` each publish the registry entry.

## Release pull request

Push the commit to `master`. The Release workflow runs Release Please. When a component has releasable commits, Release Please opens a pull request that updates the manifest, changelogs, and package versions.

Review that pull request. Merge it when the notes look right. Skip hand tagging and hand publishing.

## What happens on merge

The merge pushes `master` and the workflow runs again.

1. Release Please creates the GitHub release and the component tag (`v1.2.3`, `wsc-mcp-vX.Y.Z`, or `wsc-lint-vX.Y.Z`).
2. When `mcp-server--release_created` is `true`, the workflow runs `npm test`, builds `wsc-mcp`, checks that `initialize` returns `writing-style-checker`, then runs `npm publish --provenance --access public`.
3. When `cli--release_created` is `true`, the workflow runs `npm test`, builds `wsc-lint`, runs the CLI smoke checks, then publishes the same way.
4. When the root output `release_created` is `true`, the workflow reads `major` and force-moves tag `v<major>` onto that release commit. While the major is 1, `theserverlessdev/wsc@v1` follows the latest `v1.x.y` Action release. The bot writes an annotated tag.
5. After the `wsc-mcp` npm publish succeeds, the workflow calls Publish to MCP Registry. That job waits until npm lists the version, then logs in with OIDC.

Publish jobs use npm trusted publishing (OIDC). They request `id-token: write`, install npm `>= 11.5.1` on Node 22, and set the npm registry URL. They do not use `NPM_TOKEN`.

### Major tag and the registry tag

`GITHUB_TOKEN` can create tags, and those tags do not start other workflows. The `wsc-mcp-v*` tag from Release Please does not start the registry workflow by itself. The Release workflow calls that workflow with `workflow_call` after npm publish. The registry workflow still has its `wsc-mcp-v*` tag trigger and `workflow_dispatch`, so a tag you push with your own credentials still publishes.

The major-tag move uses `GITHUB_TOKEN` with `contents: write`. If you add tag rulesets later, allow the Actions bot to update `v1` and later major tags.

## npm trusted publisher setup

Do this once on npmjs.com for `wsc-mcp` and again for `wsc-lint`, before the first automated publish. Each new publisher must complete a successful publish within 2 days or the config expires.

1. Open the package on npmjs.com, then **Settings**, then **Trusted Publisher**.
2. Choose **GitHub Actions**.
3. GitHub org or user: `theserverlessdev`
4. Repository: `wsc`
5. Workflow filename: `release.yml` (the file name only, not the path)
6. Leave **Environment name** empty. The Release workflow does not use a GitHub environment.
7. Allow direct `npm publish`. npm docs say trusted publishers created after 3 Sep 2026 allow staged publish (`npm stage publish`) until you also allow direct `npm publish`. This workflow runs `npm publish`.

Provenance needs `repository.url` on each published package to point at this repository, plus `directory` for the package folder:

- `mcp-server/package.json`: `git+https://github.com/theserverlessdev/wsc.git` and `"directory": "mcp-server"`
- `cli/package.json`: the same URL and `"directory": "cli"`

## Health Check

GitHub turns off a public scheduled workflow after 60 days without a commit, an issue, or a pull request. Workflow runs do not count. [Keepalive](../.github/workflows/keepalive.yml) enables Health Check and itself through the Actions API. It runs on each push to `master`, once a week, and on `workflow_dispatch`. Repeating the enable call is safe when the workflow is already on. The call does not count as repository activity, so it leaves the 60-day clock alone.

A disabled workflow does not run, so Keepalive cannot revive itself. If Health Check is still off after this lands, enable it once. This command does not delete or rewrite anything:

```bash
gh workflow enable "Health Check"
```

If Keepalive is off as well, run `gh workflow enable "Keepalive"` once. Later pushes to `master` then enable Health Check again.
