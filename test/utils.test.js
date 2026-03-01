import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatePeerId, formatBytes, bufferToHex, chunk } from '../src/utils.js';

describe('Utils', () => {
  describe('generatePeerId', () => {
    it('should generate a 20-byte peer ID', () => {
      const peerId = generatePeerId();
      assert.strictEqual(peerId.length, 20);
    });

    it('should start with -DA0100-', () => {
      const peerId = generatePeerId();
      const prefix = peerId.slice(0, 8).toString();
      assert.strictEqual(prefix, '-DA0100-');
    });

    it('should generate unique peer IDs', () => {
      const peerId1 = generatePeerId();
      const peerId2 = generatePeerId();
      assert.notStrictEqual(peerId1.toString('hex'), peerId2.toString('hex'));
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      assert.strictEqual(formatBytes(0), '0 B');
    });

    it('should format bytes', () => {
      assert.strictEqual(formatBytes(500), '500 B');
    });

    it('should format kilobytes', () => {
      assert.strictEqual(formatBytes(1024), '1 KB');
      assert.strictEqual(formatBytes(1536), '1.5 KB');
    });

    it('should format megabytes', () => {
      assert.strictEqual(formatBytes(1048576), '1 MB');
      assert.strictEqual(formatBytes(5242880), '5 MB');
    });

    it('should format gigabytes', () => {
      assert.strictEqual(formatBytes(1073741824), '1 GB');
      assert.strictEqual(formatBytes(2147483648), '2 GB');
    });

    it('should format terabytes', () => {
      assert.strictEqual(formatBytes(1099511627776), '1 TB');
    });
  });

  describe('bufferToHex', () => {
    it('should convert buffer to hex string', () => {
      const buffer = Buffer.from([0x12, 0x34, 0xab, 0xcd]);
      assert.strictEqual(bufferToHex(buffer), '1234abcd');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from([]);
      assert.strictEqual(bufferToHex(buffer), '');
    });
  });

  describe('chunk', () => {
    it('should split array into chunks', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8];
      const chunks = chunk(arr, 3);
      assert.deepStrictEqual(chunks, [[1, 2, 3], [4, 5, 6], [7, 8]]);
    });

    it('should handle exact divisions', () => {
      const arr = [1, 2, 3, 4];
      const chunks = chunk(arr, 2);
      assert.deepStrictEqual(chunks, [[1, 2], [3, 4]]);
    });

    it('should handle empty array', () => {
      const arr = [];
      const chunks = chunk(arr, 3);
      assert.deepStrictEqual(chunks, []);
    });

    it('should handle chunk size larger than array', () => {
      const arr = [1, 2];
      const chunks = chunk(arr, 5);
      assert.deepStrictEqual(chunks, [[1, 2]]);
    });
  });
});
