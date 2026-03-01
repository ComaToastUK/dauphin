import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { PieceManager } from '../src/pieces.js';

describe('PieceManager', () => {
  let mockTorrent;
  let pieceManager;

  beforeEach(() => {
    // Create mock torrent with 4 pieces of 256 bytes each
    const pieceHashes = [
      crypto.randomBytes(20),
      crypto.randomBytes(20),
      crypto.randomBytes(20),
      crypto.randomBytes(20)
    ];

    mockTorrent = {
      getNumPieces: () => 4,
      getPieceLength: () => 256,
      getSize: () => 1024,
      getPieceHashes: () => pieceHashes,
      getName: () => 'test.txt'
    };

    pieceManager = new PieceManager(mockTorrent);
  });

  describe('constructor', () => {
    it('should initialize with correct values', () => {
      assert.strictEqual(pieceManager.numPieces, 4);
      assert.strictEqual(pieceManager.pieceLength, 256);
      assert.strictEqual(pieceManager.totalSize, 1024);
      assert.strictEqual(pieceManager.blockSize, 16384);
    });

    it('should initialize tracking arrays', () => {
      assert.strictEqual(pieceManager.requested.length, 4);
      assert.strictEqual(pieceManager.received.length, 4);
      assert.strictEqual(pieceManager.verified.length, 4);
      assert.ok(pieceManager.requested.every(v => v === false));
      assert.ok(pieceManager.received.every(v => v === false));
      assert.ok(pieceManager.verified.every(v => v === false));
    });
  });

  describe('hasPiece', () => {
    it('should return true if peer has piece', () => {
      // Bitfield: 10100000 (has pieces 0 and 2)
      const bitfield = Buffer.from([0b10100000]);
      assert.ok(pieceManager.hasPiece(bitfield, 0));
      assert.strictEqual(pieceManager.hasPiece(bitfield, 1), 0);
      assert.ok(pieceManager.hasPiece(bitfield, 2));
      assert.strictEqual(pieceManager.hasPiece(bitfield, 3), 0);
    });

    it('should handle empty bitfield', () => {
      assert.strictEqual(pieceManager.hasPiece(null, 0), false);
      assert.strictEqual(pieceManager.hasPiece(Buffer.from([]), 0), false);
    });

    it('should handle out of bounds index', () => {
      const bitfield = Buffer.from([0b10000000]);
      assert.strictEqual(pieceManager.hasPiece(bitfield, 100), false);
    });
  });

  describe('getNextPiece', () => {
    it('should return first unrequested piece', () => {
      const bitfield = Buffer.from([0b11111111]);
      const piece = pieceManager.getNextPiece(bitfield);
      assert.strictEqual(piece, 0);
      assert.strictEqual(pieceManager.requested[0], true);
    });

    it('should skip requested pieces', () => {
      const bitfield = Buffer.from([0b11111111]);
      pieceManager.requested[0] = true;
      pieceManager.requested[1] = true;
      const piece = pieceManager.getNextPiece(bitfield);
      assert.strictEqual(piece, 2);
    });

    it('should return null if no pieces available', () => {
      const bitfield = Buffer.from([0b00000000]);
      const piece = pieceManager.getNextPiece(bitfield);
      assert.strictEqual(piece, null);
    });

    it('should return null if all pieces requested', () => {
      const bitfield = Buffer.from([0b11111111]);
      pieceManager.requested.fill(true);
      const piece = pieceManager.getNextPiece(bitfield);
      assert.strictEqual(piece, null);
    });
  });

  describe('getPieceSize', () => {
    it('should return piece length for normal pieces', () => {
      assert.strictEqual(pieceManager.getPieceSize(0), 256);
      assert.strictEqual(pieceManager.getPieceSize(1), 256);
      assert.strictEqual(pieceManager.getPieceSize(2), 256);
    });

    it('should return correct size for last piece', () => {
      // Last piece is full size since 1024 % 256 = 0
      assert.strictEqual(pieceManager.getPieceSize(3), 256);
    });

    it('should handle last piece with remainder', () => {
      // Create torrent with 1000 bytes (last piece should be 232 bytes)
      mockTorrent.getSize = () => 1000;
      const pm = new PieceManager(mockTorrent);
      assert.strictEqual(pm.getPieceSize(3), 232);
    });
  });

  describe('getNextBlock', () => {
    it('should return first block for new piece', () => {
      const block = pieceManager.getNextBlock(0);
      assert.ok(block);
      assert.strictEqual(block.offset, 0);
      assert.strictEqual(block.length, 256); // Piece is smaller than block size
    });

    it('should return null when all blocks received', () => {
      pieceManager.blocks.set(0, new Set([0]));
      const block = pieceManager.getNextBlock(0);
      assert.strictEqual(block, null);
    });
  });

  describe('addBlock', () => {
    it('should store block data', () => {
      const data = Buffer.alloc(256);
      const isComplete = pieceManager.addBlock(0, 0, data);
      assert.ok(pieceManager.pieces[0]);
      assert.strictEqual(pieceManager.pieces[0].length, 256);
      assert.strictEqual(isComplete, true);
    });

    it('should track received blocks', () => {
      const data = Buffer.alloc(100);
      pieceManager.addBlock(0, 0, data);
      assert.ok(pieceManager.blocks.has(0));
      assert.ok(pieceManager.blocks.get(0).has(0));
    });

    it('should return true when piece is complete', () => {
      const data = Buffer.alloc(256);
      const isComplete = pieceManager.addBlock(0, 0, data);
      assert.strictEqual(isComplete, true);
    });
  });

  describe('isPieceComplete', () => {
    it('should return false for pieces without blocks', () => {
      assert.strictEqual(pieceManager.isPieceComplete(0), false);
    });

    it('should return true when all blocks received', () => {
      pieceManager.blocks.set(0, new Set([0]));
      assert.strictEqual(pieceManager.isPieceComplete(0), true);
    });
  });

  describe('verifyPiece', () => {
    it('should verify correct piece', () => {
      const data = Buffer.alloc(256);
      const hash = crypto.createHash('sha1').update(data).digest();
      
      // Update mock to return our hash
      mockTorrent.getPieceHashes = () => [hash, crypto.randomBytes(20), crypto.randomBytes(20), crypto.randomBytes(20)];
      const pm = new PieceManager(mockTorrent);
      pm.pieces[0] = data;
      
      const verified = pm.verifyPiece(0);
      assert.strictEqual(verified, true);
      assert.strictEqual(pm.verified[0], true);
      assert.strictEqual(pm.received[0], true);
    });

    it('should reject incorrect piece', () => {
      const data = Buffer.alloc(256);
      pieceManager.pieces[0] = data;
      pieceManager.requested[0] = true;
      
      const verified = pieceManager.verifyPiece(0);
      assert.strictEqual(verified, false);
      assert.strictEqual(pieceManager.verified[0], false);
      assert.strictEqual(pieceManager.pieces[0], null);
      assert.strictEqual(pieceManager.requested[0], false);
    });

    it('should return false for missing piece', () => {
      const verified = pieceManager.verifyPiece(0);
      assert.strictEqual(verified, false);
    });
  });

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = pieceManager.getProgress();
      assert.strictEqual(progress.completed, 0);
      assert.strictEqual(progress.total, 4);
      assert.strictEqual(progress.percentage, '0.00');
    });

    it('should return correct progress with verified pieces', () => {
      pieceManager.verified[0] = true;
      pieceManager.verified[1] = true;
      const progress = pieceManager.getProgress();
      assert.strictEqual(progress.completed, 2);
      assert.strictEqual(progress.percentage, '50.00');
    });
  });

  describe('isComplete', () => {
    it('should return false initially', () => {
      assert.strictEqual(pieceManager.isComplete(), false);
    });

    it('should return true when all pieces verified', () => {
      pieceManager.verified.fill(true);
      assert.strictEqual(pieceManager.isComplete(), true);
    });

    it('should return false with partial completion', () => {
      pieceManager.verified[0] = true;
      pieceManager.verified[1] = true;
      assert.strictEqual(pieceManager.isComplete(), false);
    });
  });

  describe('getBitfield', () => {
    it('should return empty bitfield initially', () => {
      const bitfield = pieceManager.getBitfield();
      assert.strictEqual(bitfield.length, 1);
      assert.strictEqual(bitfield[0], 0);
    });

    it('should return correct bitfield with verified pieces', () => {
      pieceManager.verified[0] = true;
      pieceManager.verified[2] = true;
      const bitfield = pieceManager.getBitfield();
      assert.strictEqual(bitfield[0], 0b10100000);
    });

    it('should return all bits set when complete', () => {
      pieceManager.verified.fill(true);
      const bitfield = pieceManager.getBitfield();
      assert.strictEqual(bitfield[0], 0b11110000);
    });
  });

  describe('resetPiece', () => {
    it('should reset piece state', () => {
      pieceManager.requested[0] = true;
      pieceManager.pieces[0] = Buffer.alloc(256);
      pieceManager.blocks.set(0, new Set([0]));
      
      pieceManager.resetPiece(0);
      
      assert.strictEqual(pieceManager.requested[0], false);
      assert.strictEqual(pieceManager.pieces[0], null);
      assert.strictEqual(pieceManager.blocks.has(0), false);
    });
  });

  describe('getPiece', () => {
    it('should return piece data', () => {
      const data = Buffer.alloc(256);
      pieceManager.pieces[0] = data;
      assert.strictEqual(pieceManager.getPiece(0), data);
    });

    it('should return undefined for missing piece', () => {
      assert.strictEqual(pieceManager.getPiece(0), undefined);
    });
  });
});
