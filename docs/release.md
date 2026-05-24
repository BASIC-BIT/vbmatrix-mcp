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
npm run pack:check
```

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
- Confirm `npm run pack:check` includes `dist`, `server.json`, README, changelog, docs, examples, and skills needed by users.
- Request explicit operator approval before `npm publish`.
- Request explicit operator approval before creating a GitHub release or pushing tags.

## Publishing Commands

Run only after approval:

```bash
npm publish --access public
```

Create the GitHub release only after npm publication succeeds and the package contents are verified.
