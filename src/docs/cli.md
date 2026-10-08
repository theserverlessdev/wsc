## Command-Line Tool

Check files for writing style issues from the terminal.

### Install & Run

```shell
# Check all markdown files
npx wsc-lint check "**/*.md"

# Check with a custom config
npx wsc-lint check "docs/**/*.md" --config .wscrc.json

# Skip files (stacks with config ignore)
npx wsc-lint check "**/*.md" --ignore "CHANGELOG.md,vendor/**"

# Read from stdin
echo "The code was written very quickly." | npx wsc-lint check --stdin
```

### Commands

| Command | Description |
|---------|-------------|
| `wsc check <files>` | Check files for writing issues. Supports `--format`, `--config`, `--ignore`, `--stdin`, `--max-warnings`. |
| `wsc list [detector]` | List word/phrase lists for a detector (e.g. `wsc list weaselWords`). |
| `wsc init` | Create a `.wscrc.json` config file with the `$schema` reference. |

### Output Formats

**--format text** (default):

```
README.md:3:15  weasel-word  "very"
README.md:5:1   passive-voice  "was written"
Found 2 issues in 1 file.
```

- **--format json** — Structured JSON output
- **--format github** — `::warning` annotations for GitHub Actions
