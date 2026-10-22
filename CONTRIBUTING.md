# Contributing

Thanks for helping make DSH Kanban better.

## Development

```bash
git clone https://github.com/SilasSolivagus/dsh-kanban.git
cd dsh-kanban
pnpm install
pnpm check
```

- Node.js 22+ and pnpm 10+ are expected.
- `pnpm check` runs the Host/Client build and the full test suite.
- The generated `index.js` and `client.js` are committed. Run `pnpm build` and include them when source changes affect the bundle.
- Host code lives in `src/host`; Client code in `src/client`; shared status/attention rules in `src/shared`.
- Every write goes through `src/host/store.js` and carries a task `version`. Keep optimistic-concurrency behavior intact.

## Pull requests

1. Keep the change focused; one concern per PR.
2. Add or update a test for Host/domain behavior.
3. For UI changes, include a before/after screenshot and check light/dark theme.
4. Run `pnpm check` and `git diff --check` before opening the PR.
5. Describe the user-facing behavior, not only the implementation.

## Issues

Use the issue templates when available. For bugs, include:

- DSH version and OS
- steps to reproduce
- expected vs actual behavior
- relevant Host/Client logs or `curl /kanban-api/bootstrap` output

Please do not report security issues in a public issue; open a private security advisory instead.

## License

By contributing, you agree that your contribution is licensed under the MIT License.
