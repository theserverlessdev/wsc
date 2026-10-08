# wsc-lint

A command-line tool for the [Writing Style Checker](https://wsc.theserverless.dev). Detects **weasel words**, **passive voice**, **duplicate words**, **long sentences**, **nominalizations**, **hedging language**, **filler adverbs**, and **AI tells** (words, phrases, and structures overrepresented in AI-generated text) in text files.

## Install

```bash
npx wsc-lint check "**/*.md"
```

Or do a global install:

```bash
npm install -g wsc-lint
wsc check "**/*.md"
```

## Commands

### `wsc check <files...>`

Check files for writing style issues.

```bash
# Check all markdown files
wsc check "**/*.md"

# Check specific files
wsc check README.md CONTRIBUTING.md

# Read from stdin
echo "The code was written very quickly." | wsc check --stdin

# Use a config file
wsc check "**/*.md" --config .wscrc.json

# Skip files (stacks with config ignore)
wsc check "**/*.md" --ignore "CHANGELOG.md,vendor/**"

# Output as JSON
wsc check "**/*.md" --format json

# GitHub Actions annotations
wsc check "**/*.md" --format github

# Fail if more than 10 issues
wsc check "**/*.md" --max-warnings 10

# Only show summary
wsc check "**/*.md" --quiet
```

**Options:**

| Option | Description |
|--------|-------------|
| `--config <path>` | Path to `.wscrc.json` config file |
| `--ignore <patterns>` | Glob patterns to skip (comma or newline separated). Adds to config `ignore`. |
| `--format <format>` | Output format: `text` (default), `json`, `github` |
| `--no-color` | Disable colored output |
| `--quiet` | Only show summary |
| `--max-warnings <n>` | Exit with code 1 if more than N issues |
| `--stdin` | Read from stdin instead of files |

**Exit codes:** `0` = no issues, `1` = issues found, `2` = error

### `wsc list [detector]`

List word/phrase lists used by detectors.

```bash
wsc list                  # Show available detectors
wsc list weaselWords      # List all weasel words
wsc list hedging          # List all hedging phrases
wsc list adverbs          # List all filler adverbs
wsc list nominalizations  # List all nominalizations with suggestions
wsc list aiTells          # List AI-tell words, phrases, and structural patterns
```

### `wsc init`

Create a `.wscrc.json` config file in the current directory with default settings.

```bash
wsc init
```

## Configuration

Create a `.wscrc.json` file to customize detector behavior. The CLI auto-discovers this file by walking up from each checked file's directory.

```json
{
  "$schema": "https://wsc.theserverless.dev/schema.json",
  "detectors": {
    "weaselWords": {
      "enabled": true,
      "add": ["synergy", "leverage"],
      "remove": ["very"]
    },
    "passiveVoice": { "enabled": true },
    "duplicateWords": { "enabled": true },
    "longSentences": { "enabled": true, "maxWords": 25 },
    "nominalizations": {
      "enabled": true,
      "add": [{ "word": "monetization", "suggestion": "monetize" }],
      "remove": ["management"]
    },
    "hedging": { "enabled": true },
    "adverbs": { "enabled": false }
  }
}
```

## Detection Rules

| Detector | Count | Description |
|----------|-------|-------------|
| Weasel Words | 95 | Vague terms like "very", "basically", "arguably" |
| Passive Voice | — | Auxiliary verbs + past participles (260 irregular + regular `-ed`) |
| Duplicate Words | — | Adjacent repeated words, case-insensitive |
| Long Sentences | — | Sentences exceeding a word threshold (default: 30) |
| Nominalizations | 245 | Nouns replaceable with verbs ("utilization" → "use") |
| Hedging | 100 | Phrases that weaken assertions ("I think", "it seems") |
| Filler Adverbs | 139 | Adverbs adding emphasis without substance ("totally", "utterly") |
| AI Tells | 98+83+12 | Words, phrases, and structural patterns overrepresented in AI text ("delve", "It's not just X — it's Y") |

## Output Formats

**Text** (default):

```
README.md:3:15  weasel-word  "very"
README.md:5:1   passive-voice  "was written"
Found 2 issues in 1 file.
```

**JSON** (`--format json`): Structured output with full analysis results per file.

**GitHub** (`--format github`): `::warning` annotations for GitHub Actions.

## Links

- [Web App](https://wsc.theserverless.dev) — Interactive browser-based editor
- [HTTP API](https://wsc.theserverless.dev/api/check) — POST endpoint for programmatic access
- [MCP Server](https://www.npmjs.com/package/wsc-mcp) — MCP server for AI assistants
- [GitHub](https://github.com/theserverlessdev/wsc) — Source code

## License

MIT
