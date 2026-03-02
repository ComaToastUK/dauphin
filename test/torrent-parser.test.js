import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { TorrentParser } from '../src/torrent-parser.js';

describe('TorrentParser', () => {
  let testTorrentPath;
  let testTorrentData;

  beforeEach(() => {
    // Create a minimal test torrent file
    testTorrentPath = path.join(os.tmpdir(), 'test-' + Date.now() + '.torrent');
    
    // Create bencode data manually
    const info = {
      name: Buffer.from('test-file.txt'),
      length: 1024,
      'piece length': 256,
      pieces: Buffer.concat([
        crypto.randomBytes(20),
        crypto.randomBytes(20),
        crypto.randomBytes(20),
        crypto.randomBytes(20)
      ])
    };

    const torrentData = {
      announce: Buffer.from('http://tracker.example.com:8080/announce'),
      info: info
    };

    // Encode to bencode
    const encoded = encodeBencode(torrentData);
    fs.writeFileSync(testTorrentPath, encoded);
  });

  describe('parse', () => {
    it('should parse a torrent file', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      assert.ok(parser.torrent);
    });

    it('should throw error for non-existent file', () => {
      const parser = new TorrentParser('/nonexistent/file.torrent');
      assert.throws(() => parser.parse());
    });
  });

  describe('getAnnounce', () => {
    it('should return the announce URL', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      assert.strictEqual(parser.getAnnounce(), 'http://tracker.example.com:8080/announce');
    });
  });

  describe('getName', () => {
    it('should return the torrent name', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      assert.strictEqual(parser.getName(), 'test-file.txt');
    });
  });

  describe('getSize', () => {
    it('should return the total size for single file torrent', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      assert.strictEqual(parser.getSize(), 1024);
    });
  });

  describe('getPieceLength', () => {
    it('should return the piece length', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      assert.strictEqual(parser.getPieceLength(), 256);
    });
  });

  describe('getNumPieces', () => {
    it('should return the number of pieces', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      assert.strictEqual(parser.getNumPieces(), 4);
    });
  });

  describe('getPieceHash', () => {
    it('should return the hash for a specific piece', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      const hash = parser.getPieceHash(0);
      assert.ok(Buffer.isBuffer(hash));
      assert.strictEqual(hash.length, 20);
    });

    it('should return different hashes for different pieces', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      const hash0 = parser.getPieceHash(0);
      const hash1 = parser.getPieceHash(1);
      assert.notStrictEqual(hash0.toString('hex'), hash1.toString('hex'));
    });
  });

  describe('getPieceHashes', () => {
    it('should return all piece hashes', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      const hashes = parser.getPieceHashes();
      assert.strictEqual(hashes.length, 4);
      hashes.forEach(hash => {
        assert.strictEqual(hash.length, 20);
      });
    });
  });

  describe('getInfoHash', () => {
    it('should return a 20-byte info hash', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      const hash = parser.getInfoHash();
      assert.ok(Buffer.isBuffer(hash));
      assert.strictEqual(hash.length, 20);
    });

    it('should return consistent hash for same torrent', () => {
      const parser1 = new TorrentParser(testTorrentPath);
      parser1.parse();
      const hash1 = parser1.getInfoHash();

      const parser2 = new TorrentParser(testTorrentPath);
      parser2.parse();
      const hash2 = parser2.getInfoHash();

      assert.strictEqual(hash1.toString('hex'), hash2.toString('hex'));
    });
  });

  describe('getFiles', () => {
    it('should return file list for single file torrent', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      const files = parser.getFiles();
      assert.strictEqual(files.length, 1);
      assert.strictEqual(files[0].path, 'test-file.txt');
      assert.strictEqual(files[0].length, 1024);
    });
  });

  describe('getAnnounceList', () => {
    it('should return announce list with primary tracker', () => {
      const parser = new TorrentParser(testTorrentPath);
      parser.parse();
      const list = parser.getAnnounceList();
      assert.ok(Array.isArray(list));
      assert.ok(list.length > 0);
      assert.ok(list.includes('http://tracker.example.com:8080/announce'));
    });
  });
});

// Helper function to encode bencode
function encodeBencode(obj) {
  if (Buffer.isBuffer(obj)) {
    return Buffer.concat([Buffer.from(obj.length + ':'), obj]);
  } else if (typeof obj === 'number') {
    return Buffer.from('i' + obj + 'e');
  } else if (Array.isArray(obj)) {
    const encoded = obj.map(item => encodeBencode(item));
    return Buffer.concat([Buffer.from('l'), ...encoded, Buffer.from('e')]);
  } else if (typeof obj === 'object') {
    const encoded = [];
    Object.keys(obj).sort().forEach(key => {
      encoded.push(encodeBencode(key));
      encoded.push(encodeBencode(obj[key]));
    });
    return Buffer.concat([Buffer.from('d'), ...encoded, Buffer.from('e')]);
  } else if (typeof obj === 'string') {
    return Buffer.from(obj.length + ':' + obj);
  }
  throw new Error('Unsupported type for encoding');
}
