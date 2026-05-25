# Release Process

Releases require explicit operator approval. Do not publish to npm, create a GitHub release, or tag a release from automation unless the operator separately confirms that action.

## Package Identity

- npm package: `@basicbit/vbmatrix-mcp`
- MCP discovery name: `io.github.BASIC-BIT/vbmatrix-mcp`
- CLI: `vbmatrix-mcp`
- Doctor CLI: `vbmatrix-mcp-doctor`

Version `0.1.0` is the first packaging/onboarding release line. Use SemVer after that: patch for fixes/docs, minor for new tools or workflow additions, major for breaking tool schemas or safety default changes.

## Preflight

```bash
npm ci
npm run check
npm run build
npm run doctor
npm run package:smoke
npm run pack:check
```

`package:smoke` is a local dry-run package verification. It inspects built artifacts, confirms the CLI and doctor bin targets, and checks `npm pack --dry-run --json --ignore-scripts` contents without starting the long-lived MCP stdio server.

Optional live checks, only with a local Matrix operator present:

```bash
npm run doctor -- --vban
npm run smoke:vban
npm run verify:live-audio
```

`verify:live-audio` dry-runs by default. Running it with `--run` changes Matrix routes and requires `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO`.

## Checklist

- Confirm `package.json`, `package-lock.json`, and `server.json` versions match.
- Update `CHANGELOG.md` with date, package name, and operator-facing changes.
- Confirm `docs/client-config.md` still matches the published CLI/package command.
- Confirm `npm run doctor` reports no failed static checks after `npm run build`.
- Confirm `npm run package:smoke` passes and does not start a persistent MCP session.
- Confirm `npm run pack:check` includes `dist`, `server.json`, README, changelog, docs, examples, and skills needed by users.
- Request explicit operator approval before `npm publish`.
- Request explicit operator approval before creating a GitHub release or pushing tags.

## Automation Gates

- CI may run linting, typechecking, tests, builds, `package:smoke`, and dry-run package inspection on supported Node/OS combinations.
- The `Release Dry Run` workflow is manual-only through `workflow_dispatch`, uses read-only repository permissions, and uploads only local `npm pack` artifacts for operator inspection.
- Release automation must stay manual and dry-run only unless an operator explicitly approves publishing in the current release session.
- Do not configure workflows to publish to npm, create GitHub releases, push tags, or run live VB-Audio validation by default.
- Live VB-Audio checks remain opt-in/manual because they depend on local Matrix state and operator supervision.

## Dry-Run Workflow

Use the manual `Release Dry Run` GitHub Actions workflow before any publish decision. It runs `npm ci`, `npm run check`, `npm run build`, `npm run package:smoke`, `npm run pack:check`, then creates a local package tarball with `npm pack --pack-destination artifacts --json` and uploads the tarball plus pack metadata as a workflow artifact.

This workflow is intentionally not a release workflow. It must not require `NPM_TOKEN`, publish to npm, push tags, create GitHub releases, or run live VB-Audio validation. Treat the uploaded tarball as an inspection artifact only; discard it if any preflight check fails or the operator declines the release.

## Publishing Commands

Run only after approval:

```bash
npm publish --access public
```

Create the GitHub release only after npm publication succeeds and the package contents are verified.
