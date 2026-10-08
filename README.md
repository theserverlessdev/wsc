# Writing Style Checker

[![CI](https://github.com/theserverlessdev/wsc/actions/workflows/ci.yml/badge.svg)](https://github.com/theserverlessdev/wsc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/wsc-mcp)](https://www.npmjs.com/package/wsc-mcp)
[![smithery badge](https://smithery.ai/badge/theserverlessdev/wsc)](https://smithery.ai/servers/theserverlessdev/wsc)
[![wsc MCP server](https://glama.ai/mcp/servers/theserverlessdev/wsc/badges/score.svg)](https://glama.ai/mcp/servers/theserverlessdev/wsc)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A prose linter and AI-slop detector. WSC finds **AI tells** — words, phrases, and sentence structures overrepresented in AI-generated text, each flag backed by a published corpus study. It also catches classic writing issues: **weasel words**, **passive voice**, **duplicate words**, **long sentences**, **nominalizations**, **hedging**, and **filler adverbs**. Available as a web editor, HTTP API, MCP server, CLI, and GitHub Action.

**[Live: wsc.theserverless.dev](https://wsc.theserverless.dev)**

![Screenshot of Writing Style Checker](static/images/ss.png)

## Features

- **Web Editor** - Real-time highlighting with inline fix buttons for all 8 detectors
- **HTTP API** - POST text with optional config, retrieve structured JSON responses
- **MCP Server (Remote)** - Connect AI assistants via Streamable HTTP transport
- **MCP Server (Local)** - Stdio-based server via [`wsc-mcp`](https://www.npmjs.com/package/wsc-mcp) on npm
- **CLI** - Check files from the command line via `wsc-lint`
- **GitHub Action** - Run checks in CI with `::warning` annotations
- **Configurable** - Customize detectors with `.wscrc.json` files

---

## What WSC is (and isn't)

WSC flags patterns that research on AI-generated text finds overrepresented, and cites a source for every flag. It does not, and cannot, prove authorship. Classifier-based detectors carry a documented false-accusation risk: a Stanford study found that seven of them misflagged 61% of essays written by non-native English speakers. WSC avoids that trap by design — every flag is a specific, explainable edit that improves the text no matter who, or what, wrote it.

---

## Detection Rules

| Detector | Items | Description |
|----------|-------|-------------|
| **Weasel Words** | 95 words/phrases | Vague terms like "very", "basically", "arguably", "numerous" |
| **Passive Voice** | 260 irregular verbs | Auxiliary verbs + past participles (regular `-ed` + irregular) |
| **Duplicate Words** | — | Adjacent repeated words across whitespace, case-insensitive |
| **Long Sentences** | threshold: 30 words | Sentences exceeding a configurable word count |
| **Nominalizations** | 245 word pairs | Nouns replaceable with verbs ("utilization" → "use") |
| **Hedging** | 100 phrases | Phrases that weaken assertions ("I think", "it seems") |
| **Filler Adverbs** | 139 words | Adverbs adding emphasis without substance ("totally", "utterly") |
| **AI Tells** | 98 words (+111 inflected forms) + 83 phrases + 12 structural patterns | Words, phrases, and sentence constructions overrepresented in AI-generated text (`delve`, `rich tapestry`, `It's not just X — it's Y`) |

Word lists sourced from [Matt Might's shell scripts](https://matt.might.net/articles/shell-scripts-for-passive-voice-weasel-words-duplicates/) and expanded with additional entries. AI tells draw on published corpus studies: Kobak et al. 2025 (Science Advances), Juzek & Ward 2025 (COLING), Liang et al. 2024 (Stanford), and Reinhart et al. 2025 (PNAS). Wikipedia's editor-maintained [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) catalogue and AI-detection vendor reports round out the sources.

---

## Configuration

Create a `.wscrc.json` to customize detectors. All tools (API, MCP, CLI) support it.

```json
{
  "$schema": "https://wsc.theserverless.dev/schema.json",
  "detectors": {
    "weaselWords": {
      "enabled": true,
      "add": ["synergy", "leverage"],
      "remove": ["very"]
    },
    "longSentences": { "maxWords": 25 },
    "adverbs": { "enabled": false }
  }
}
```

Every field is optional. Missing fields use defaults. JSON Schema provides autocompletion in VS Code.

---

## API Usage

### `POST /api/check`

Analyze text for writing style issues. Accepts optional `config` object.

```bash
curl -X POST https://wsc.theserverless.dev/api/check \
  -H "Content-Type: application/json" \
  -d '{"text":"The code was written very quickly."}'
```

**Response:**

```json
{
  "summary": {
    "total": 2,
    "weaselWords": 1,
    "passiveVoice": 1,
    "duplicateWords": 0,
    "longSentences": 0,
    "nominalizations": 0,
    "hedging": 0,
    "adverbs": 0
  },
  "issues": {
    "weaselWords": [{ "word": "very", "index": 21, "line": 1, "column": 22, "context": "..." }],
    "passiveVoice": [{ "phrase": "was written", "index": 9, "line": 1, "column": 10, "context": "..." }],
    "duplicateWords": [],
    "longSentences": [],
    "nominalizations": [],
    "hedging": [],
    "adverbs": []
  },
  "meta": { "characterCount": 34, "wordCount": 6, "sentenceCount": 1, "processingTimeMs": 2 }
}
```

**With config:**

```bash
curl -X POST https://wsc.theserverless.dev/api/check \
  -H "Content-Type: application/json" \
  -d '{"text":"The code was written very quickly.", "config":{"detectors":{"weaselWords":{"enabled":false}}}}'
```

### `GET /api/check`

Returns API documentation as JSON.

### `GET /api/detectors`

Returns the list of all 8 detectors with descriptions, configurability, and word counts.

### `GET /health`

Runs a smoke test with known text and returns `{"status":"healthy"}` or `503`.

**Limits:** Max 100,000 characters per request. CORS enabled for all origins.

---

## MCP Server

The Writing Style Checker is available as an [MCP](https://modelcontextprotocol.io/) server, letting AI assistants check your writing directly.

### Tools

| Tool | Description |
|------|-------------|
| `check_text` | Analyze text for all 8 writing style issues. Accepts optional `config`. |
| `fix_duplicates` | Remove duplicate adjacent words and return cleaned text |
| `list_word_lists` | Return info about all detector word lists |
| `check_file` | *(Local only)* Read a file from disk and analyze it. Auto-discovers `.wscrc.json`. |

### Remote MCP Server

Connect any MCP client to the hosted server - no installation required.

```json
{
  "mcpServers": {
    "writing-style-checker": {
      "type": "url",
      "url": "https://wsc.theserverless.dev/mcp"
    }
  }
}
```

### Local MCP Server (stdio)

Install via npm for local usage. Includes `check_file` for analyzing files on disk with auto-discovery of `.wscrc.json`.

```bash
npx wsc-mcp
```

**Claude Desktop / Claude Code config:**

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

See the [`wsc-mcp` npm page](https://www.npmjs.com/package/wsc-mcp) for full documentation.

---

## CLI

Check files from the command line.

```bash
# Check all markdown files
npx wsc-lint check "**/*.md"

# Read from stdin
echo "The code was written very quickly." | npx wsc-lint check --stdin

# JSON output for scripting
npx wsc-lint check "**/*.md" --format json

# GitHub Actions annotations
npx wsc-lint check "**/*.md" --format github

# Create a config file
npx wsc-lint init
```

See the [`wsc-lint` README](cli/README.md) for full documentation.

---

## GitHub Action

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: '**/*.md'
    max-warnings: 20
    exclude: |
      CHANGELOG.md
      vendor/**
```

| Input | Default | Description |
|-------|---------|-------------|
| `files` | `**/*.md` | Glob pattern for files to check |
| `config` | — | Path to `.wscrc.json` config file |
| `max-warnings` | unlimited | Max warnings before failing |
| `only-changed` | `false` | Only check files changed in this PR |
| `exclude` | — | Glob patterns to skip. Separate with a comma or a new line. Adds to config `ignore`. |

---

## Privacy

The web editor runs **in your browser** - we never send text to any server. The API and MCP endpoints only process text you explicitly send to them.

---

## Project Structure

```
.
├── src/
│   ├── core/                    # Shared detection engine
│   │   ├── detector.ts          # 8 detection algorithms
│   │   ├── words.ts             # Word/phrase lists (800+ entries)
│   │   ├── config.ts            # Config types, merging, validation
│   │   ├── config-node.ts       # Node-only: file loading, discovery
│   │   ├── analyzer.ts          # Unified analyzeText() entry point
│   │   └── index.ts             # Public API exports
│   ├── docs/                    # Documentation content (Markdown files)
│   ├── mcp/
│   │   └── handler.ts           # MCP JSON-RPC 2.0 handler
│   ├── lib/
│   │   ├── App.svelte           # Main editor page component
│   │   ├── stores/theme.ts      # Theme store (light/dark/system)
│   │   └── components/          # UI components (StatsBar, ConfigPanel, etc.)
│   ├── routes/
│   │   ├── +layout.svelte       # Shared layout (header, nav, footer)
│   │   ├── api/check/+server.ts # HTTP API endpoint
│   │   ├── mcp/+server.ts       # MCP endpoint
│   │   ├── health/+server.ts    # Health check endpoint
│   │   ├── docs/+page.svelte    # Documentation page
│   │   └── words/+page.svelte   # Word library browser
│   └── styles/
│       └── main.scss            # Global styles (light + dark themes)
├── mcp-server/                  # Standalone stdio MCP server (npm: wsc-mcp)
├── cli/                         # CLI tool (npm: wsc-lint)
├── action/                      # GitHub Action (composite)
├── tests/                       # 341 tests across 18 files
├── static/
│   ├── schema.json              # JSON Schema for .wscrc.json
│   ├── llms.txt                 # AI/LLM discovery file
│   └── llms-full.txt            # Detailed LLM context
├── wrangler.toml                # Cloudflare Workers config
└── svelte.config.js             # SvelteKit configuration
```

---

## Local Development

```bash
git clone https://github.com/theserverlessdev/wsc.git
cd wsc
npm install
npm run dev
```

Visit `http://localhost:5173`. The API is at `/api/check`, MCP at `/mcp`, health at `/health`.

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run check` | Type check with svelte-check |
| `npm test` | Run all 341 tests |
| `npm run test:coverage` | Coverage report |

## Deployment

Deployed as a Cloudflare Worker at `wsc.theserverless.dev`.

```bash
npm run build
npx wrangler deploy
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and pull request guidelines.

For substantial changes, please [open an issue](https://github.com/theserverlessdev/wsc/issues) first.

## Acknowledgements

- [Matt Might](https://matt.might.net/) for the [original shell scripts](https://matt.might.net/articles/shell-scripts-for-passive-voice-weasel-words-duplicates/)
- Built with [SvelteKit](https://svelte.dev/) and [Svelte 5](https://svelte.dev/blog/svelte-5-is-alive), deployed on [Cloudflare Workers](https://workers.cloudflare.com/)
- Logo made with [DiffusionBee](https://diffusionbee.com/)

## License

[MIT](LICENSE)
