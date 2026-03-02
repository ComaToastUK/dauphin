# Dauphin 🐬

[![CI](https://github.com/comatoastuk/dauphin/actions/workflows/ci.yml/badge.svg)](https://github.com/comatoastuk/dauphin/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/dauphin.svg)](https://badge.fury.io/js/dauphin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight and clean BitTorrent client written in Node.js.

## Features

- Pure JavaScript implementation (no external torrent libraries)
- HTTP and UDP tracker support
- Peer wire protocol implementation
- Piece verification with SHA-1 hashing
- Clean command-line interface
- Progress tracking

## Installation

### Global Installation (Recommended)

Install globally to use the `dauphin` command anywhere:

```bash
npm install -g dauphin
```

### Local Installation

Install in your project:

```bash
npm install dauphin
```

### From Source

Clone and install:

```bash
git clone https://github.com/yourusername/dauphin.git
cd dauphin
npm install
npm link
```

## Usage

### Basic Usage

```bash
dauphin <torrent-file>
```

### With Options

```bash
# Specify output directory
dauphin file.torrent -o ~/Downloads

# Enable debug mode
dauphin file.torrent --debug

# Show help
dauphin --help

# Show version
dauphin --version
```

### Options

- `-o, --output <dir>` - Output directory for downloads (default: `./downloads`)
- `-h, --help` - Show help message
- `-v, --version` - Show version number
- `--debug` - Enable debug mode with detailed error output

## Examples

Download Ubuntu ISO:
```bash
dauphin ubuntu.torrent
```

Download to specific folder:
```bash
dauphin movie.torrent --output /media/downloads
```

## Architecture

- **src/index.js** - CLI entry point
- **src/torrent-parser.js** - Parses .torrent files (bencode decoding)
- **src/tracker.js** - Communicates with trackers (HTTP/UDP)
- **src/peer.js** - Handles peer connections and wire protocol
- **src/pieces.js** - Manages piece selection and verification
- **src/downloader.js** - Coordinates the download process
- **src/utils.js** - Utility functions

## Protocol Support

- BitTorrent Protocol (BEP 3)
- HTTP Tracker Protocol
- UDP Tracker Protocol (BEP 15)

## Development

### Running Tests

```bash
npm test
```

### Running in Watch Mode

```bash
npm run test:watch
```

### Running from Source

```bash
npm start -- file.torrent -o ./downloads
```

## Requirements

- Node.js >= 18.0.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
