## Configuration

Create a `.wscrc.json` file in your project root to customize which detectors run and which words they flag.
The CLI, GitHub Action, and local MCP server auto-discover this file.

### JSON Schema

Add a `$schema` key for autocompletion and to validate your config in your editor:

```json
{
  "$schema": "https://wsc.theserverless.dev/schema.json"
}
```

You can find the full schema at `https://wsc.theserverless.dev/schema.json`.

Generate a starter config with the CLI:

```shell
npx wsc-lint init
```

### Ignoring files

`ignore` is an array of glob patterns. Each pattern is relative to the working directory. The GitHub Action runs from the repository root.

The CLI skips `**/node_modules/**` and `**/.git/**` on every file check. It adds `ignore` patterns to that list, along with the Action `exclude` input and the CLI `--ignore` flag.

```json
{
  "ignore": ["CHANGELOG.md", "docs/vendor/**"]
}
```

### Detector Reference

All 8 detectors run by default. Set `enabled: false` to disable any detector.

| Detector | Options |
|----------|---------|
| `weaselWords` | `enabled`, `add`, `remove` |
| `passiveVoice` | `enabled` only — uses grammar-based pattern matching (auxiliary verb + past participle), not a word list |
| `duplicateWords` | `enabled` only — detects adjacent repeated words via pattern matching |
| `longSentences` | `enabled`, `maxWords` (integer, default: 30) |
| `nominalizations` | `enabled`, `add` (array of `{word, suggestion}`), `remove` |
| `hedging` | `enabled`, `add`, `remove` |
| `adverbs` | `enabled`, `add`, `remove` |
| `aiTells` | `enabled`, `add`, `remove` (vocabulary), `addPhrases`, `removePhrases`, `removePatterns` |

### Word List Overrides

**add** appends words to the built-in list (case-insensitive, no duplicates).

**remove** removes words from the built-in list (case-insensitive match).

Browse the full built-in word lists on the [Word Library](/words) page.

### AI Tells Structural Patterns

Beyond words and phrases, the AI tells detector ships named structural patterns: regexes for sentence constructions that corpus studies attribute to LLMs. Examples include `negative-parallelism` (`It's not just X — it's Y`), `trailing-participial-analysis` (`, highlighting the importance of...`), and `vague-attribution` (`experts agree`, `studies show`). Removing a vocabulary word also removes its inflected forms (`delve` covers `delves`, `delved`, `delving`).

Disable individual patterns by name with `removePatterns`:

```json
{
  "detectors": {
    "aiTells": {
      "removePatterns": ["not-only-but-also", "vague-attribution"]
    }
  }
}
```

The full pattern list with names appears on the [Word Library](/words) page under "AI Tells (Patterns)", or via `wsc list aiTells`.

### Full Example

```json
{
  "$schema": "https://wsc.theserverless.dev/schema.json",
  "ignore": ["CHANGELOG.md"],
  "detectors": {
    "weaselWords": {
      "add": ["arguably", "basically"],
      "remove": ["many"]
    },
    "passiveVoice": {
      "enabled": false
    },
    "longSentences": {
      "maxWords": 25
    },
    "nominalizations": {
      "add": [
        { "word": "delegation", "suggestion": "delegate" }
      ]
    },
    "hedging": {
      "remove": ["I think"]
    },
    "aiTells": {
      "remove": ["robust"],
      "addPhrases": ["circle back"]
    }
  }
}
```
