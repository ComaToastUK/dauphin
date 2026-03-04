import crypto from 'crypto';

/**
 * Manages pieces for a torrent download
 */
export class PieceManager {
  constructor(torrent) {
    this.torrent = torrent;
    this.numPieces = torrent.getNumPieces();
    this.pieceLength = torrent.getPieceLength();
    this.totalSize = torrent.getSize();
    this.pieceHashes = torrent.getPieceHashes();
    
    // Track piece status
    this.requested = new Array(this.numPieces).fill(false);
    this.received = new Array(this.numPieces).fill(false);
    this.verified = new Array(this.numPieces).fill(false);
    
    // Store piece data
    this.pieces = new Array(this.numPieces);
    
    // Block tracking (16KB blocks per piece)
    this.blockSize = 16384; // 16 KB
    this.blocks = new Map(); // pieceIndex -> Set of received block offsets
    this.requestedBlocks = new Map(); // pieceIndex -> Set of requested block offsets
  }

  /**
   * Get the next piece to request
   */
  getNextPiece(peerBitfield) {
    // Simple rarest-first strategy (simplified to sequential for now)
    for (let i = 0; i < this.numPieces; i++) {
      if (!this.requested[i] && !this.received[i] && this.hasPiece(peerBitfield, i)) {
        this.requested[i] = true;
        return i;
      }
    }
    return null;
  }

  /**
   * Check if peer has a piece
   */
  hasPiece(bitfield, index) {
    if (!bitfield || bitfield.length === 0) return false;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    if (byteIndex >= bitfield.length) return false;
    return (bitfield[byteIndex] >> (7 - bitIndex)) & 1;
  }

  /**
   * Get piece length for a specific piece
   */
  getPieceSize(index) {
    if (index === this.numPieces - 1) {
      // Last piece might be smaller
      const remainder = this.totalSize % this.pieceLength;
      return remainder === 0 ? this.pieceLength : remainder;
    }
    return this.pieceLength;
  }

  /**
   * Get the next block to request for a piece
   */
  getNextBlock(pieceIndex) {
    if (!this.blocks.has(pieceIndex)) {
      this.blocks.set(pieceIndex, new Set());
    }
    if (!this.requestedBlocks.has(pieceIndex)) {
      this.requestedBlocks.set(pieceIndex, new Set());
    }

    const receivedBlocks = this.blocks.get(pieceIndex);
    const requestedBlocks = this.requestedBlocks.get(pieceIndex);
    const pieceSize = this.getPieceSize(pieceIndex);
    const numBlocks = Math.ceil(pieceSize / this.blockSize);

    for (let i = 0; i < numBlocks; i++) {
      const offset = i * this.blockSize;
      // Skip if already received or already requested
      if (!receivedBlocks.has(offset) && !requestedBlocks.has(offset)) {
        const length = Math.min(this.blockSize, pieceSize - offset);
        // Mark as requested
        requestedBlocks.add(offset);
        return { offset, length };
      }
    }

    return null; // All blocks received or requested for this piece
  }

  /**
   * Store a received block
   */
  addBlock(pieceIndex, offset, data) {
    if (!this.pieces[pieceIndex]) {
      this.pieces[pieceIndex] = Buffer.alloc(this.getPieceSize(pieceIndex));
    }

    data.copy(this.pieces[pieceIndex], offset);

    if (!this.blocks.has(pieceIndex)) {
      this.blocks.set(pieceIndex, new Set());
    }
    this.blocks.get(pieceIndex).add(offset);

    // Check if piece is complete
    return this.isPieceComplete(pieceIndex);
  }

  /**
   * Check if all blocks for a piece have been received
   */
  isPieceComplete(pieceIndex) {
    if (!this.blocks.has(pieceIndex)) return false;
    
    const receivedBlocks = this.blocks.get(pieceIndex);
    const pieceSize = this.getPieceSize(pieceIndex);
    const numBlocks = Math.ceil(pieceSize / this.blockSize);
    
    return receivedBlocks.size === numBlocks;
  }

  /**
   * Verify a piece against its hash
   */
  verifyPiece(pieceIndex) {
    if (!this.pieces[pieceIndex]) return false;

    const hash = crypto.createHash('sha1').update(this.pieces[pieceIndex]).digest();
    const expectedHash = this.pieceHashes[pieceIndex];

    if (hash.equals(expectedHash)) {
      this.verified[pieceIndex] = true;
      this.received[pieceIndex] = true;
      return true;
    }

    // Verification failed, reset the piece
    this.pieces[pieceIndex] = null;
    this.blocks.delete(pieceIndex);
    this.requested[pieceIndex] = false;
    return false;
  }

  /**
   * Get piece data
   */
  getPiece(pieceIndex) {
    return this.pieces[pieceIndex];
  }

  /**
   * Get download progress
   */
  getProgress() {
    const completed = this.verified.filter(v => v).length;
    return {
      completed,
      total: this.numPieces,
      percentage: ((completed / this.numPieces) * 100).toFixed(2),
      bytes: completed * this.pieceLength
    };
  }

  /**
   * Check if download is complete
   */
  isComplete() {
    return this.verified.every(v => v);
  }

  /**
   * Get our bitfield to send to peers
   */
  getBitfield() {
    const bitfield = Buffer.alloc(Math.ceil(this.numPieces / 8));
    for (let i = 0; i < this.numPieces; i++) {
      if (this.verified[i]) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        bitfield[byteIndex] |= 1 << (7 - bitIndex);
      }
    }
    return bitfield;
  }

  /**
   * Reset a piece request (for timeout/error)
   */
  resetPiece(pieceIndex) {
    this.requested[pieceIndex] = false;
    this.received[pieceIndex] = false;
    this.verified[pieceIndex] = false;
    this.pieces[pieceIndex] = null;
    this.blocks.delete(pieceIndex);
    this.requestedBlocks.delete(pieceIndex);
  }

  /**
   * Release piece data from memory after writing to disk
   */
  releasePiece(pieceIndex) {
    this.pieces[pieceIndex] = null;
    this.blocks.delete(pieceIndex);
    this.requestedBlocks.delete(pieceIndex);
  }
}

export default PieceManager;
