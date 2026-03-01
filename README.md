# Dauphin 🐬

A lightweight and clean BitTorrent client written in Node.js.

## Features

- Pure JavaScript implementation (no external torrent libraries)
- HTTP and UDP tracker support
- Peer wire protocol implementation
- Piece verification with SHA-1 hashing
- Clean command-line interface
- Progress tracking

## Installation

```bash
npm install
```

## Usage

```bash
node src/index.js <torrent-file-path>
```

Example:
```bash
node src/index.js ubuntu.torrent
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

## License

MIT
