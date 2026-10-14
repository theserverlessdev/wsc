# Release and Deployment

This document covers how to deploy the Writing Style Checker to Cloudflare Workers and how package publishes used to work by hand.

Action tags, `wsc-mcp`, and `wsc-lint` now release through [Release Please](docs/RELEASING.md). Cloudflare Workers Builds still deploys the site. Do not bump those package versions with `npm version` or push `v*`, `wsc-mcp-v*`, or `wsc-lint-v*` tags yourself while that workflow is active. The manual commands below describe the old path.

---

## Table of Contents

- [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
- [npm Package Publishing (wsc-mcp)](#npm-package-publishing-wsc-mcp)
- [npm Package Publishing (wsc-lint)](#npm-package-publishing-wsc-lint)
- [GitHub Action](#github-action)
- [DNS Setup](#dns-setup)
- [Rollback](#rollback)

---

## Cloudflare Workers Deployment

The SvelteKit app (frontend + API + remote MCP server) is deployed as a single Cloudflare Worker.

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`npm install -g wrangler`)
- Authenticated with Cloudflare (`wrangler login`)
- DNS configured for `wsc.theserverless.dev` (see [DNS Setup](#dns-setup))

### Configuration

The deployment is configured in `wrangler.toml`:

```toml
name = "wsc"
main = ".svelte-kit/cloudflare/_worker.js"
compatibility_date = "2026-03-26"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".svelte-kit/cloudflare/assets"
binding = "ASSETS"

[observability]
enabled = true

[[routes]]
pattern = "wsc.theserverless.dev"
custom_domain = true
```

There is a single environment — no `[env.*]` sections. Do **not** deploy with `--env production`: that creates a separate `wsc-production` Worker instead of updating `wsc`. To deploy your own instance, change the `[[routes]]` pattern to your domain (wrangler uses whichever Cloudflare account you're logged into).

### Pre-Deployment Checklist

```bash
# 1. Run tests
npm test

# 2. Run type checking
npm run check

# 3. Build locally and verify
npm run build

# 4. Preview locally (optional)
npm run preview
```

### Deploy to Production

```bash
npm run build
npx wrangler deploy
```

This will:
1. Upload the Worker and static assets to Cloudflare
2. Attach the `wsc.theserverless.dev` custom domain to the `wsc` Worker

Note that `wrangler deploy` does **not** run the build for you — always `npm run build` first, or you'll ship the previous build output.

### Preview Locally

```bash
npm run dev        # Vite dev server at localhost:5173
npm run preview    # Production build in the Workers runtime
```

### View Logs

```bash
npx wrangler tail
```

This streams real-time logs from the production Worker. Useful for debugging API or MCP endpoint issues.

### Verify Deployment

After deploying, run these quick checks:

```bash
# Frontend loads
curl -s -o /dev/null -w "%{http_code}" https://wsc.theserverless.dev
# Expected: 200

# API works
curl -s -X POST https://wsc.theserverless.dev/api/check \
  -H "Content-Type: application/json" \
  -d '{"text":"very good"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Issues: {d[\"summary\"][\"total\"]}')"
# Expected: Issues: 1

# MCP works
curl -s -X POST https://wsc.theserverless.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Tools: {len(d[\"result\"][\"tools\"])}')"
# Expected: Tools: 3
# (check_text, fix_duplicates, list_word_lists — check_file is only in the
# standalone wsc-mcp package, since the remote server has no filesystem)
```

---

## npm Package Publishing (wsc-mcp)

The standalone stdio MCP server lives in `mcp-server/` and is published to npm as `wsc-mcp`.

### Prerequisites

- npm account with publish access
- Authenticated with npm (`npm login`)

### Pre-Publish Checklist

```bash
cd mcp-server

# 1. Install dependencies
npm install

# 2. Build
npm run build

# 3. Verify the build output exists
ls dist/mcp-server/index.js

# 4. Verify it starts without errors
timeout 2 node dist/mcp-server/index.js < /dev/null 2>&1; echo "Exit: $?"
```

### Review package.json

Before publishing, verify `mcp-server/package.json`:

- `name`: `wsc-mcp`
- `version`: Update to the version you want to publish
- `description`: Accurate description
- `main`: `dist/index.js`
- `bin.wsc-mcp`: `dist/index.js` (this is what `npx wsc-mcp` runs)
- `license`: MIT
- `author`: Correct

### Update Version

```bash
cd mcp-server

# Patch release (1.0.0 -> 1.0.1)
npm version patch

# Minor release (1.0.0 -> 1.1.0)
npm version minor

# Major release (1.0.0 -> 2.0.0)
npm version major
```

### Files Included in Package

The `mcp-server/` directory does not have a `.npmignore` or `files` field, so npm will include everything except what's in `.gitignore`. For a clean package, add a `files` field to `mcp-server/package.json`:

```json
{
  "files": [
    "dist/"
  ]
}
```

This ensures only the compiled output is published — not the TypeScript source, `tsconfig.json`, or `node_modules`.

### Dry Run

Always do a dry run first to see exactly what will be published:

```bash
cd mcp-server
npm pack --dry-run
```

Review the file list. It should contain:
- `package.json`
- `dist/mcp-server/index.js` (entry point)
- `dist/mcp-server/server.js` (server logic)
- `dist/src/core/detector.js` (bundled core)
- `dist/src/core/words.js` (bundled core)
- `dist/src/core/index.js` (bundled core)
- Corresponding `.d.ts` declaration files

### Publish

```bash
cd mcp-server

# Publish to npm
npm publish

# Or publish with a tag (e.g., beta)
npm publish --tag beta
```

### Verify Published Package

```bash
# Check it exists on npm
npm info wsc-mcp

# Test installation
npx wsc-mcp --help 2>&1 || echo "(server starts on stdio, no --help flag)"

# Test in a temporary directory
cd /tmp
mkdir wsc-test && cd wsc-test
npm init -y
npm install wsc-mcp
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | timeout 5 npx wsc-mcp 2>/dev/null
cd .. && rm -rf wsc-test
```

### Post-Publish: Update Claude Desktop Config

Users can now install via:

```json
{
  "mcpServers": {
    "writing-style-checker": {
      "command": "npx",
      "args": ["wsc-mcp"]
    }
  }
}
```

---

## npm Package Publishing (wsc-lint)

The CLI tool lives in `cli/` and is published to npm as `wsc-lint`.

### Pre-Publish Checklist

```bash
cd cli

# 1. Install dependencies
npm install

# 2. Build
npm run build

# 3. Verify the build output exists
ls dist/cli/index.js

# 4. Smoke test
echo "The code was written very quickly." | node dist/cli/index.js check --stdin
```

### Publish

```bash
cd cli
npm version patch   # or minor/major
npm publish
```

### Verify

```bash
npx wsc-lint --help
echo "very good" | npx wsc-lint check --stdin
```

---

## GitHub Action

The GitHub Action lives in `action.yml` at the repository root (required for GitHub Marketplace listing) and is a composite action that uses `wsc-lint` under the hood. Users reference it directly from the repo. `action/action.yml` is a deprecated copy kept for one release cycle so old `theserverlessdev/wsc/action@master` references keep working.

### How It Works

The action:
1. Sets up Node.js 22
2. Installs and builds `wsc-lint` from source (via `npm ci` + `npm run build`)
3. Optionally fetches changed files in PRs (when `only-changed: "true"`)
4. Runs `wsc check` with `--format github` to produce inline annotations

### Usage

Users add this to their workflow:

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: "**/*.md"
```

### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `files` | `**/*.md` | Glob pattern for files to check |
| `config` | _(none)_ | Path to `.wscrc.json` config file |
| `max-warnings` | `-1` (unlimited) | Maximum warnings before failing |
| `only-changed` | `false` | Only check files changed in this PR |
| `exclude` | _(none)_ | Glob patterns to skip (comma or newline separated). Adds to config `ignore`. |

### Outputs

| Output | Description |
|--------|-------------|
| `total-issues` | Total number of issues found |

### Releasing Updates

Release Please now tags `vX.Y.Z` and the Release workflow moves `v1`. See [docs/RELEASING.md](docs/RELEASING.md). The commands below are the manual equivalent:

Users reference the action by the moving major tag `@v1`. Any change to `action.yml`, `cli/`, or `src/core/` that affects the action's behavior ships by cutting a new release tag and moving `v1`:

```bash
git tag -a v1.2.0 -m "action v1.2.0: <what changed>"
git tag -f v1 v1.2.0
git push origin v1.2.0
git push -f origin v1
```

To publish the release (and the Marketplace listing) create a GitHub release from the new `v1.x.y` tag. The "Publish this Action to the GitHub Marketplace" checkbox is only available in the web release UI, not via `gh` or the API.

Users who want to pin an exact version can reference the full tag:
```yaml
- uses: theserverlessdev/wsc@v1.1.0
```

### Testing the Action Locally

```bash
# Build the CLI (the action depends on it)
cd cli && npm ci && npm run build && cd ..

# Simulate what the action runs
node cli/dist/cli/index.js check "**/*.md" --format github
```

---

## DNS Setup

To set up `wsc.theserverless.dev` (or your own domain):

### Option A: Cloudflare-Managed DNS

If `theserverless.dev` is on Cloudflare:

1. Go to Cloudflare Dashboard > DNS
2. Add a record:
   - **Type**: AAAA
   - **Name**: wsc
   - **Content**: `100::` (dummy address; Cloudflare proxies the request to the Worker)
   - **Proxy status**: Proxied (orange cloud)

The Worker route in `wrangler.toml` (`wsc.theserverless.dev/*`) handles the rest.

### Option B: External DNS

If the domain is managed elsewhere:

1. Add a CNAME record pointing `wsc.theserverless.dev` to your Workers subdomain (e.g., `wsc.your-subdomain.workers.dev`)
2. In the Cloudflare dashboard, add the custom domain under Workers > your Worker > Settings > Domains & Routes

---

## Rollback

### Cloudflare Worker

Wrangler keeps deployment versions. To rollback:

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to a previous deployment
npx wrangler rollback
```

Or redeploy from a previous git commit:

```bash
git checkout <previous-commit>
npm run build && npx wrangler deploy
git checkout master
```

### npm Package

npm does not support un-publishing after 72 hours. To effectively rollback:

```bash
# Deprecate the bad version
cd mcp-server
npm deprecate wsc-mcp@1.0.1 "Known issue, use 1.0.0 instead"

# Publish a new fixed version
npm version patch
npm publish
```

---

## Release Workflow Summary

The automated path lives in [docs/RELEASING.md](docs/RELEASING.md). The script below is the old manual sequence:

A typical release that includes the web app and npm packages:

```bash
# 1. Run all checks
npm test
npm run check

# 2. Build everything
npm run build
cd mcp-server && npm run build && cd ..
cd cli && npm run build && cd ..

# 3. Deploy web app to Cloudflare
npx wrangler deploy

# 4. Verify deployment
curl -s https://wsc.theserverless.dev/health | python3 -m json.tool

# 5. Bump and publish MCP server
cd mcp-server && npm version patch && npm publish && cd ..

# 6. Bump and publish CLI
cd cli && npm version patch && npm publish && cd ..

# 7. Commit version bumps
git add mcp-server/package.json mcp-server/package-lock.json cli/package.json cli/package-lock.json
git commit -m "release: wsc-mcp + wsc-lint"

# 8. Tag and push
# Tag convention: per-package tags for npm releases, plain v-tags for the
# repo/GitHub Action releases (moving major tag v1 → latest v1.x.y).
git tag -a wsc-lint-v$(node -p "require('./cli/package.json').version") -m "wsc-lint release"
git tag -a wsc-mcp-v$(node -p "require('./mcp-server/package.json').version") -m "wsc-mcp release"
git push && git push --tags
```
