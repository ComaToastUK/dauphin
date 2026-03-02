# Publishing Guide

## Automated Publishing with GitHub Actions ✨

The easiest way to publish is through GitHub Releases - the workflow handles everything!

### Quick Publish

```bash
# 1. Update version
npm version patch  # or minor, or major

# 2. Push changes with tags
git push && git push --tags

# 3. Create GitHub Release (or use the web UI)
gh release create v0.1.1 --generate-notes

# 4. Done! GitHub Actions publishes to NPM automatically 🎉
```

### Setup (One-Time)

1. **Create NPM Automation Token:**
   ```bash
   npm login
   npm token create --type=automation
   ```

2. **Add to GitHub Secrets:**
   - Go to: Repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: (paste your token)
   - Save

3. **That's it!** Now releases automatically publish to NPM.

## Manual Publishing (Alternative)

If you need to publish manually without GitHub Actions:

### Prepare for Publishing

1. **Update package.json metadata**
   - Set your author name
   - Update repository URLs
   - Verify version number

2. **Test locally**
   ```bash
   npm link
   dauphin --help
   dauphin --version
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Check package contents**
   ```bash
   npm pack --dry-run
   ```

## Publishing to npm

### First Time Setup

1. **Create npm account**
   - Visit https://www.npmjs.com/signup
   - Or run: `npm adduser`

2. **Login**
   ```bash
   npm login
   ```

### Publish

1. **Publish the package**
   ```bash
   npm publish
   ```

2. **For scoped packages (optional)**
   ```bash
   npm publish --access public
   ```

### Version Updates

Follow semantic versioning (semver):

```bash
# Patch release (0.1.0 -> 0.1.1)
npm version patch

# Minor release (0.1.0 -> 0.2.0)
npm version minor

# Major release (0.1.0 -> 1.0.0)
npm version major

# Then publish
npm publish
```

## Post-Publishing

1. **Test installation**
   ```bash
   npm install -g dauphin
   dauphin --version
   ```

2. **Create GitHub release**
   - Tag the version
   - Add release notes

## Checklist Before Publishing

- [ ] Tests pass (`npm test`)
- [ ] README is up to date
- [ ] Version number is correct
- [ ] Author and repository info are set
- [ ] LICENSE file exists
- [ ] .gitignore is configured
- [ ] Package works when installed globally (`npm link`)
- [ ] No sensitive data in the repository

## Useful Commands

```bash
# View what will be included in package
npm pack --dry-run

# Check for outdated dependencies
npm outdated

# View package info
npm view dauphin

# Unpublish (within 72 hours)
npm unpublish dauphin@<version>

# Deprecate a version
npm deprecate dauphin@<version> "Reason for deprecation"
```

## GitHub Actions Workflows

### CI Workflow
- **Trigger:** Push/PR to main
- **Tests:** Node 18.x, 20.x, 21.x on Ubuntu, macOS, Windows
- **Status:** ![CI](https://github.com/comatoastuk/dauphin/actions/workflows/ci.yml/badge.svg)

### Publish Workflow
- **Trigger:** GitHub Release created
- **Actions:** Test → Build → Publish to NPM
- **Security:** Uses NPM provenance for verification

### Release Drafter
- **Trigger:** Push to main
- **Actions:** Automatically drafts release notes
- **Benefit:** Pre-filled release notes from PRs

## Publishing Checklist

- [ ] Tests pass locally (`npm test`)
- [ ] Tests pass on CI
- [ ] Version bumped (`npm version`)
- [ ] CHANGELOG updated (optional, Release Drafter helps)
- [ ] Changes pushed to main
- [ ] Tag pushed (`git push --tags`)
- [ ] GitHub Release created
- [ ] NPM publish workflow succeeded
- [ ] Package available on NPM

## Troubleshooting

### "Version already exists"
```bash
# Bump version again
npm version patch
git push --tags
```

### "Permission denied to publish"
- Verify NPM_TOKEN is set in GitHub Secrets
- Check token has publish permissions
- Ensure you're a package owner/collaborator

### "CI tests failing"
- Check Actions tab for logs
- Fix issues locally
- Push fixes before creating release

### "Publish workflow not running"
- Ensure release is "published" not "draft"
- Check workflow file syntax
- Verify NPM_TOKEN secret exists

## Tips

- Use `.npmignore` if you need different rules than `.gitignore`
- Test on different platforms before publishing
- Keep dependencies minimal (currently zero! 🎉)
- Use `npm version` to automatically create git tags
- Consider setting up CI/CD for automated publishing
