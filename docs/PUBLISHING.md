# Publishing

These notes are for RepoSpend maintainers.

## Before Publishing

Run the release checks from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
npm publish --dry-run
```

Make sure `package.json` and the workspace package versions match the intended
release version.

## Version Bump

If the version has not already been bumped, update it before committing the
release:

```bash
pnpm version patch --no-git-tag-version
```

For a specific version:

```bash
pnpm version 0.0.3 --no-git-tag-version
```

Review the changed package files before committing.

## Tag And Push

After committing the release, create the matching Git tag and push both `main`
and the tag:

```bash
git tag v0.0.3
git push origin main v0.0.3
```

The publish workflow runs when a `v*.*.*` tag is pushed. After npm publishes
successfully, the workflow also creates a GitHub release for the tag using the
matching section from `CHANGELOG.md`. For example, tag `v0.0.4` uses the
`## 0.0.4` changelog section.

## npm Trusted Publishing

The npm package `repospend` must have Trusted Publishing configured for:

- GitHub repository: `mehmetdemircs/RepoSpend`
- Workflow file: `.github/workflows/publish.yml`
- npm workflow filename setting: `publish.yml`

No `NPM_TOKEN` is required when Trusted Publishing is configured correctly.
