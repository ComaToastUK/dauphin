# Quick Reference: GitHub Actions CI/CD

## 🚀 Quick Publish Workflow

```bash
# 1. Make your changes and commit
git add .
git commit -m "Add awesome feature"

# 2. Bump version
npm version patch   # 0.1.0 → 0.1.1
# or
npm version minor   # 0.1.0 → 0.2.0
# or
npm version major   # 0.1.0 → 1.0.0

# 3. Push everything
git push && git push --tags

# 4. Create Release on GitHub
# Option A: Using GitHub CLI
gh release create v0.1.1 --generate-notes

# Option B: Using GitHub Web UI
# Go to: Releases → Draft a new release → Choose tag → Publish

# 5. Wait ~2 minutes
# ✅ CI runs tests
# ✅ Package publishes to NPM
# ✅ Users can install: npm install -g dauphin
```

## 📋 Workflow Overview

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI** | Push/PR to main | Test on multiple Node versions & OSes |
| **Publish** | GitHub Release | Publish to NPM automatically |
| **Release Drafter** | Push to main | Auto-generate release notes |

## 🔧 One-Time Setup

```bash
# 1. Get NPM token
npm token create --type=automation

# 2. Add to GitHub
# Settings → Secrets → Actions → New secret
# Name: NPM_TOKEN
# Value: (paste token)
```

## ✅ What Runs on Each Event

### On Pull Request
```
✓ Run tests on Node 18, 20, 21
✓ Test on Linux, macOS, Windows
✓ Verify package builds
✓ Lint checks
```

### On Push to Main
```
✓ All PR checks
✓ Update draft release notes
```

### On Release Published
```
✓ Run all tests
✓ Build package
✓ Publish to NPM with provenance
✓ Users can install immediately
```

## 📊 Status Checks

Check workflow status:
- GitHub repo → Actions tab
- README badges show current status
- Email notifications on failures

## 🆘 Common Issues

### "Tests failing on Windows"
- Check path separators
- Test locally with WSL or VM

### "NPM publish failed"
- Verify NPM_TOKEN in Secrets
- Check version not already published
- Ensure you're package owner

### "Release not triggering publish"
- Make sure release is "Published" not "Draft"
- Check workflow file exists: `.github/workflows/publish.yml`
- Verify tag format: `v0.1.0`

## 📦 Package Information

After successful publish:
- **NPM:** https://www.npmjs.com/package/dauphin
- **Install:** `npm install -g dauphin`
- **Usage:** `dauphin --help`

## 🎯 Best Practices

1. **Always test locally first**
   ```bash
   npm test
   npm pack --dry-run
   ```

2. **Use semantic versioning**
   - Breaking change? → Major
   - New feature? → Minor
   - Bug fix? → Patch

3. **Write good release notes**
   - Release Drafter helps with this!
   - Add manual notes if needed

4. **Monitor Actions tab**
   - Check results after push
   - Review logs if failures occur

## 📚 More Information

- Full guide: `.github/WORKFLOWS.md`
- Publishing: `PUBLISHING.md`
- Contributing: `CONTRIBUTING.md`
