# Contributing to Dauphin

We love your input! We want to make contributing to Dauphin as easy and transparent as possible.

## Development Process

1. Fork the repo
2. Create a branch from `main`
3. Make your changes
4. Add/update tests
5. Ensure tests pass
6. Create a pull request

## Setup Development Environment

```bash
# Clone your fork
git clone https://github.com/your-username/dauphin.git
cd dauphin

# Install dependencies (currently none!)
npm install

# Link for local testing
npm link

# Run tests
npm test

# Run in watch mode during development
npm run test:watch
```

## Running Dauphin Locally

```bash
# Direct execution
node src/index.js file.torrent

# Using npm script
npm start -- file.torrent -o ./downloads

# Using linked command
dauphin file.torrent
```

## Testing

- All new features should include tests
- Bug fixes should include a test that would have caught the bug
- Maintain or improve test coverage

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch
```

## Code Style

- Use ES modules (`import/export`)
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small
- Follow existing code style

## Pull Request Process

1. Update README.md with details of changes if needed
2. Update tests as needed
3. Ensure all tests pass
4. Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/)
5. The PR will be merged once approved by maintainers

## Bug Reports

**Great Bug Reports** include:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Provide sample .torrent file if possible
- What you expected to happen
- What actually happened
- Notes (why you think this might be happening, things you tried)

## Feature Requests

We're open to new features! Please:

- Explain the feature clearly
- Explain why it's useful
- Keep the scope focused
- Consider if it fits the "lightweight" philosophy

## Project Goals

Keep Dauphin:
- **Lightweight** - Zero dependencies, small codebase
- **Clean** - Readable, well-documented code
- **Educational** - Good for learning BitTorrent protocol
- **Functional** - Actually works for downloading torrents

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
