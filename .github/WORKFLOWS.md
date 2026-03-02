# GitHub Actions Workflows

This repository uses GitHub Actions for continuous integration and automated publishing.

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` branch
- Pull requests to `main` branch

**Jobs:**

#### Test Matrix
- **Node.js versions:** 18.x, 20.x, 21.x
- **Operating Systems:** Ubuntu, macOS, Windows
- **Total combinations:** 9 (3 Node versions × 3 OSes)

**Steps:**
1. Checkout code
2. Setup Node.js with caching
3. Install dependencies with `npm ci`
4. Run all tests (`npm test`)
5. Verify package can be built (`npm pack --dry-run`)

#### Lint Check
- Runs on Ubuntu with Node.js 20.x
- Checks for console statements (warning only)

### 2. Publish Workflow (`.github/workflows/publish.yml`)

**Triggers:**
- GitHub Release creation

**Jobs:**

#### Publish to NPM
- Runs on Ubuntu with Node.js 20.x
- Uses NPM provenance for package verification
- Publishes with public access

**Steps:**
1. Checkout code
2. Setup Node.js with NPM registry
3. Install dependencies
4. Run tests (safety check)
5. Build package
6. Publish to NPM with provenance

## Setup Instructions

### 1. NPM Token Setup

To enable automated publishing, you need to add your NPM token to GitHub Secrets:

1. **Generate NPM Token:**
   ```bash
   npm login
   npm token create --type=automation
   ```
   
2. **Add to GitHub Secrets:**
   - Go to your repository on GitHub
   - Navigate to: Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your NPM token
   - Click "Add secret"

### 2. Publishing a New Version

Follow these steps to publish a new version:

```bash
# 1. Update version number
npm version patch   # or minor, or major

# 2. Push changes and tags
git push
git push --tags

# 3. Create a GitHub Release
# Go to GitHub → Releases → Draft a new release
# - Choose your tag
# - Add release notes
# - Click "Publish release"

# The workflow will automatically publish to NPM!
```

### 3. Automatic Publishing Flow

```
Developer creates release → GitHub Release created
                          ↓
           Publish workflow triggered
                          ↓
           Tests run automatically
                          ↓
           Package published to NPM
                          ↓
           Users can: npm install -g dauphin
```

## Workflow Features

### ✅ CI Workflow
- **Multi-version testing** - Ensures compatibility across Node.js versions
- **Cross-platform testing** - Tests on Linux, macOS, and Windows
- **Fast with caching** - npm dependencies are cached
- **PR validation** - Automatic checks on pull requests
- **Package verification** - Ensures package can be built

### ✅ Publish Workflow
- **Automated publishing** - No manual npm publish needed
- **Safety checks** - Tests run before publishing
- **NPM Provenance** - Enhanced security and transparency
- **Release-based** - Only publishes on official releases
- **Public access** - Package is publicly available

## Status Badges

The README now includes status badges:

- **CI Badge** - Shows build status
- **NPM Version Badge** - Shows current published version
- **License Badge** - Displays MIT license

## Troubleshooting

### CI Failing?
- Check the Actions tab on GitHub for detailed logs
- Ensure all tests pass locally: `npm test`
- Verify package builds: `npm pack --dry-run`

### Publish Failing?
- Verify NPM_TOKEN is correctly set in GitHub Secrets
- Ensure you have permissions to publish the package
- Check if the version number was already published
- Review the publish workflow logs

### Version Already Exists?
```bash
# Increment version and try again
npm version patch
git push --tags
# Create new release on GitHub
```

## Best Practices

1. **Always test locally first:**
   ```bash
   npm test
   npm pack --dry-run
   ```

2. **Use semantic versioning:**
   - `patch` (0.1.0 → 0.1.1) - Bug fixes
   - `minor` (0.1.0 → 0.2.0) - New features
   - `major` (0.1.0 → 1.0.0) - Breaking changes

3. **Write good release notes:**
   - Describe what changed
   - List new features
   - Document breaking changes
   - Credit contributors

4. **Monitor the Actions tab:**
   - Check CI results on PRs
   - Verify publish workflow succeeds
   - Review logs if something fails

## Manual Publishing (Fallback)

If you need to publish manually:

```bash
npm test
npm publish --access public
```

## Security Notes

- NPM_TOKEN should be an **automation token**
- Never commit tokens to the repository
- Tokens are stored securely in GitHub Secrets
- Provenance adds cryptographic proof of package origin
- Only repository maintainers can create releases
