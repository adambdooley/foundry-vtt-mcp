# Repository Guidelines

## Project Structure & Module Organization
- Root uses npm workspaces; TypeScript sources live in `packages/` and `shared/`.
- `packages/mcp-server/src/` implements the Claude ↔ Foundry MCP backend; build artifacts land in `dist/`.
- `packages/foundry-module/` ships the Foundry VTT module assets (`module.json`, `templates/`, `generated-maps/`, `styles/`).
- `shared/src/` holds reusable Zod schemas, constants, and types consumed by both workspaces.
- Installer scripts and NSIS assets reside in `installer/`.

## Build, Test, and Development Commands
- `npm run dev` starts the MCP server workspace in watch mode for local iteration.
- `npm run build:release` compiles shared types, bundles the MCP server, and builds the Foundry module.
- `npm run test` executes Vitest across workspaces; scope with `--workspace=@foundry-mcp/server` when targeting a single package.
- `npm run lint`, `npm run format:check`, and `npm run typecheck` gate style, formatting, and TypeScript sanity.
- `npm run installer:stage` stages the Windows installer offline.

## Coding Style & Naming Conventions
- TypeScript-first codebase; prefer module-scoped helpers and explicit exports over default exports.
- Prettier enforces 2-space indentation, 100 character width, single quotes, and required semicolons—run `npm run format`.
- ESLint rules demand nullish coalescing, optional chaining, no floating promises, and restrict console usage to `warn`/`error`.
- Use kebab-case for filenames (`foundry-client.ts`), PascalCase for classes, and suffix shared Zod schemas with `Schema`.

## Testing Guidelines
- Author unit tests with Vitest alongside source (`src/__tests__/feature.test.ts`); create `__tests__` folders as needed.
- Run `npm run test --workspace=@foundry-mcp/server` locally and `npm run test:coverage --workspace=@foundry-mcp/server` before requesting review.
- Mock outbound HTTP/WebSocket traffic and keep fixtures beside each test.
- Document manual reproduction steps or new commands in the PR when fixing regressions.

## Commit & Pull Request Guidelines
- Follow Conventional Commits as in history (`feat:`, `fix:`, `ci:`, `chore(release):`), keeping each commit focused.
- Re-sync npm lockfiles and generated `dist/` assets in separate commits from logic changes.
- PRs should include a summary, linked issue (Foundry, Claude, or GitHub), and UI screenshots when the module output changes.
- State which local checks were run (`lint`, `test`, `build:foundry`, etc.) and note any follow-up TODOs.

## Security & Configuration Tips
- Copy `.env.example` to `.env` for local secrets; never commit live API tokens or Foundry credentials.
- Ensure `module.json` versions stay aligned with `package.json` by running `node validate-manifest.js`.
- When staging installers, audit `installer/build-nsis.js` output for hard-coded paths before publishing artifacts.
