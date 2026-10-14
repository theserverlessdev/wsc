# Writing Style Checker GitHub Action

> **Note:** the action now lives at the repository root (for GitHub Marketplace listing). Reference it as `theserverlessdev/wsc@v1`. The old `theserverlessdev/wsc/action@master` path still works for one more release cycle — switch now.

Check your writing for style issues in CI. Detects weasel words, passive voice, duplicate words, long sentences, nominalizations, hedging language, filler adverbs, and AI tells (words, phrases, and structures overrepresented in AI-generated text).

## Usage

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: '**/*.md'
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `files` | Glob pattern for files to check | `**/*.md` |
| `config` | Path to `.wscrc.json` config file | — |
| `max-warnings` | Max warnings before failing | `-1` (unlimited) |
| `only-changed` | On a pull request, check changed files that match `files`. If none match, skip the check. Other events check `files`. | `false` |
| `exclude` | Glob patterns to skip (comma or newline separated). Adds to config `ignore`. | — |

## Outputs

| Output | Description |
|--------|-------------|
| `total-issues` | Total number of issues found |

## Examples

### Check all markdown files

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: '**/*.md'
```

### Fail if more than 20 issues

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: '**/*.md'
    max-warnings: 20
```

### Only check changed files in PRs

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: '**/*.md'
    only-changed: true
```

### Use a custom config

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: 'docs/**/*.md'
    config: .wscrc.json
```

### Exclude files

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: 'content/*.md'
    exclude: |
      content/00.front-matter.md
      content/07.contributions.md
      content/90.back-matter.md
```

`exclude` adds to the `ignore` list in `.wscrc.json`. It does not replace that list.

## Links

- [Writing Style Checker](https://wsc.theserverless.dev)
- [CLI Documentation](https://www.npmjs.com/package/wsc-lint)
- [GitHub Repository](https://github.com/theserverlessdev/wsc)
