# Contributing to Writing Style Checker

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/theserverlessdev/wsc.git
cd wsc
npm install
npm run dev
```

The app runs at `http://localhost:5173` with the API at `/api/check`, MCP at `/mcp`, and health at `/health`.

## Running Tests

```bash
npm test              # Run all 341 tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Type Checking

```bash
npm run check         # svelte-check — must pass with 0 errors, 0 warnings
```

## Building

```bash
npm run build         # SvelteKit build for Cloudflare Workers
```

### MCP Server

```bash
cd mcp-server && npm install && npm run build
```

### CLI

```bash
cd cli && npm install && npm run build
```

## Architecture

All consumers (API, MCP, CLI, frontend) call `analyzeText()` from `src/core/analyzer.ts`. This is the single entry point that runs all enabled detectors with config overrides applied.

### Adding a New Detector

1. **Add word list** (if applicable) to `src/core/words.ts`
2. **Add detection function** to `src/core/detector.ts` — follow the pattern: pure function, takes `text` + optional word list, returns `Array<{ index, length, ... }>`
3. **Add config types** to `src/core/config.ts` — add the detector to `WscConfig`, `DEFAULT_CONFIG`, `KNOWN_DETECTOR_NAMES`, and validation
4. **Wire into analyzer** in `src/core/analyzer.ts` — add the detector call and include results in `AnalysisResult`
5. **Export** from `src/core/index.ts`
6. **Add tests**: `tests/core/detector-{name}.test.ts` with standard patterns (empty, clean, detected, case-insensitive, correct index/length, custom word list)
7. **Update frontend** components — highlight class in `App.svelte`, stat in `StatsBar.svelte`, issue section in `IssueList.svelte`, legend item in `Legend.svelte`
8. **Update styles** in `src/styles/main.scss` — CSS variables for light + dark themes
9. **Update docs** in `src/docs/` — add the new detector to the config reference table

No changes needed to API, MCP, or CLI — they all go through `analyzeText()`.

### Configuration System

- `src/core/config.ts` — Browser-safe types, merging, validation (no Node.js imports)
- `src/core/config-node.ts` — Node-only file loading (`loadConfigFromFile`, `findConfigFile`)
- `.wscrc.json` — User config file; JSON Schema at `static/schema.json`

All config types support `enabled` (boolean). Word-list detectors also support `add`/`remove` arrays. Long sentences supports `maxWords`.

### Test Expectations

- Unit tests for every detector, config function, and analyzer path
- Integration tests for config combinations
- Contract tests for API schema and MCP protocol compliance
- Snapshot tests for output format stability
- Word list integrity tests (no duplicates, no cross-list overlap, lowercase)

## What to Contribute

- **Word lists**: Add to `src/core/words.ts`. Ensure no duplicates and no overlap with other lists.
- **New detectors**: Follow the pattern above.
- **Bug fixes and UI improvements**: PRs welcome.
- **Documentation**: Update `src/docs/*.md` files (rendered on the website), README, and CONTRIBUTING.

## Commits and releases

Use [Conventional Commits](https://www.conventionalcommits.org/) on `master`. `feat` opens a minor release, `fix` opens a patch release, and a `BREAKING CHANGE` footer opens a major release. Release Please turns those commits into a release pull request. See [docs/RELEASING.md](docs/RELEASING.md).

## Pull Request Process

1. Fork the repo and create a feature branch from `master`
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Ensure type checking passes: `npm run check`
5. Ensure the build succeeds: `npm run build`
6. Add tests for new functionality
7. Open a PR with a clear description of the change

## Code Style

- TypeScript for all new code
- No linter configured — follow existing patterns
- Keep functions small and focused
- Avoid adding dependencies unless necessary

## Reporting Issues

Open an issue on [GitHub](https://github.com/theserverlessdev/wsc/issues) with:
- What you expected to happen
- What actually happened
- Steps to reproduce (text input that triggers the bug, if applicable)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
