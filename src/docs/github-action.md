## GitHub Action

Automatically check writing style in pull requests and pushes.

### Basic Usage

```yaml
# .github/workflows/writing-check.yml
name: Writing Style Check
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
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
| `exclude` | _(none)_ | Glob patterns to skip. Separate with a comma or a new line. Adds to config `ignore`. |

### Outputs

| Output | Description |
|--------|-------------|
| `total-issues` | Total number of issues found across all files |

### Check Only Changed Files in PRs

```yaml
# .github/workflows/writing-check.yml
name: Writing Style Check
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
      - uses: theserverlessdev/wsc@v1
        with:
          only-changed: "true"
          max-warnings: "10"
```

### With Custom Config

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: "docs/**/*.md"
    config: ".wscrc.json"
```

### Exclude files

Use `exclude` to skip files without a `.wscrc.json`. Patterns add to the config `ignore` list. They do not replace it.

```yaml
- uses: theserverlessdev/wsc@v1
  with:
    files: "content/*.md"
    exclude: |
      content/00.front-matter.md
      content/07.contributions.md
      content/90.back-matter.md
```

A comma-separated list is valid: `exclude: "CHANGELOG.md,vendor/**"`.

Issues appear as inline annotations on the pull request's "Files changed" tab using GitHub's `::warning` format.
