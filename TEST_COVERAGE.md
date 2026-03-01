# Test Coverage Summary

All unit tests passing: **75 tests, 0 failures** ✓

## Test Files

### 1. [test/utils.test.js](test/utils.test.js) - Utility Functions
- **generatePeerId**: Validates 20-byte peer ID generation with correct prefix
- **formatBytes**: Tests byte formatting (B, KB, MB, GB, TB)
- **bufferToHex**: Tests hex string conversion
- **chunk**: Tests array chunking with various sizes

### 2. [test/torrent-parser.test.js](test/torrent-parser.test.js) - Torrent File Parsing
- **parse**: Validates .torrent file parsing and error handling
- **getAnnounce**: Tests tracker URL extraction
- **getName**: Tests torrent name extraction
- **getSize**: Tests total size calculation
- **getPieceLength**: Tests piece length extraction
- **getNumPieces**: Tests piece count calculation
- **getPieceHash**: Tests individual piece hash retrieval
- **getPieceHashes**: Tests all piece hashes retrieval
- **getInfoHash**: Tests SHA-1 info hash generation and consistency
- **getFiles**: Tests file list extraction
- **getAnnounceList**: Tests tracker list with fallbacks

### 3. [test/pieces.test.js](test/pieces.test.js) - Piece Management
- **constructor**: Tests initialization of piece tracking arrays
- **hasPiece**: Tests bitfield operations and peer piece availability
- **getNextPiece**: Tests piece selection strategy
- **getPieceSize**: Tests piece size calculation including last piece
- **getNextBlock**: Tests block request generation (16KB blocks)
- **addBlock**: Tests block data storage and piece completion detection
- **isPieceComplete**: Tests piece completion verification
- **verifyPiece**: Tests SHA-1 piece verification and failed verification handling
- **getProgress**: Tests download progress calculation
- **isComplete**: Tests complete download detection
- **getBitfield**: Tests bitfield generation for sharing with peers
- **resetPiece**: Tests piece reset after errors
- **getPiece**: Tests piece data retrieval

### 4. [test/peer.test.js](test/peer.test.js) - Peer Wire Protocol
- **constructor**: Tests peer initialization with IP, port, and IDs
- **sendHandshake**: Tests BitTorrent protocol handshake generation
- **sendMessage**: Tests message format and payload handling
- **sendKeepAlive**: Tests keep-alive message generation
- **requestPiece**: Tests piece request message format
- **sendInterested/sendNotInterested**: Tests interest state management
- **handleHandshake**: Tests handshake parsing and validation

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Coverage

The test suite covers:
- ✓ Bencode encoding/decoding
- ✓ Torrent metadata parsing
- ✓ Info hash calculation
- ✓ Piece/block management
- ✓ SHA-1 verification
- ✓ Bitfield operations
- ✓ Peer wire protocol messages
- ✓ Utility functions

## Test Framework

Using Node.js built-in test runner (Node 18+), keeping dependencies minimal and the project lightweight.
