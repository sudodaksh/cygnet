# Changesets

Use Changesets to record user-facing changes.

## Add a changeset

```bash
bun run changeset
```

Choose the semver bump type (`patch`, `minor`, `major`) and write a short summary.
Commit the generated markdown file under `.changeset/` with your PR.

## Versioning and changelog

When changesets land on `main`, the GitHub workflow creates or updates a release PR that:

- bumps `package.json` version
- updates `CHANGELOG.md`

Merge that PR to apply the version/changelog update.
