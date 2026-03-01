import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Peer } from '../src/peer.js';
import crypto from 'crypto';

describe('Peer', () => {
  const testInfoHash = crypto.randomBytes(20);
  const testPeerId = crypto.randomBytes(20);

  describe('constructor', () => {
    it('should create peer with correct properties', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash, testPeerId);
      assert.strictEqual(peer.ip, '127.0.0.1');
      assert.strictEqual(peer.port, 6881);
      assert.strictEqual(peer.infoHash, testInfoHash);
      assert.strictEqual(peer.peerId, testPeerId);
      assert.strictEqual(peer.choked, true);
      assert.strictEqual(peer.interested, false);
      assert.strictEqual(peer.connected, false);
    });

    it('should generate peer ID if not provided', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      assert.ok(Buffer.isBuffer(peer.peerId));
      assert.strictEqual(peer.peerId.length, 20);
    });
  });

  describe('sendHandshake', () => {
    it('should create valid handshake message', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash, testPeerId);
      
      // Mock socket to capture written data
      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      peer.sendHandshake();

      assert.ok(writtenData);
      assert.strictEqual(writtenData.length, 68);
      assert.strictEqual(writtenData[0], 19);
      assert.strictEqual(writtenData.slice(1, 20).toString(), 'BitTorrent protocol');
      assert.ok(writtenData.slice(28, 48).equals(testInfoHash));
      assert.ok(writtenData.slice(48, 68).equals(testPeerId));
    });
  });

  describe('sendMessage', () => {
    it('should send message with correct format', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      peer.connected = true;

      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      peer.sendMessage(2); // INTERESTED message

      assert.ok(writtenData);
      assert.strictEqual(writtenData.length, 5);
      assert.strictEqual(writtenData.readUInt32BE(0), 1); // Length
      assert.strictEqual(writtenData.readUInt8(4), 2); // Message type
    });

    it('should send message with payload', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      peer.connected = true;

      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      const payload = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      peer.sendMessage(4, payload); // HAVE message with payload

      assert.ok(writtenData);
      assert.strictEqual(writtenData.length, 9);
      assert.strictEqual(writtenData.readUInt32BE(0), 5); // Length (1 + payload)
      assert.strictEqual(writtenData.readUInt8(4), 4); // Message type
      assert.ok(writtenData.slice(5).equals(payload));
    });

    it('should not send when not connected', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      peer.connected = false;

      let writeAttempted = false;
      peer.socket = {
        write: () => { writeAttempted = true; }
      };

      peer.sendMessage(2);
      assert.strictEqual(writeAttempted, false);
    });
  });

  describe('sendKeepAlive', () => {
    it('should send keep-alive message', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      
      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      peer.sendKeepAlive();

      assert.ok(writtenData);
      assert.strictEqual(writtenData.length, 4);
      assert.strictEqual(writtenData.readUInt32BE(0), 0);
    });
  });

  describe('requestPiece', () => {
    it('should send request message with correct format', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      peer.connected = true;

      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      peer.requestPiece(5, 16384, 8192);

      assert.ok(writtenData);
      assert.strictEqual(writtenData.length, 17); // 4 + 1 + 12
      assert.strictEqual(writtenData.readUInt32BE(0), 13); // Length
      assert.strictEqual(writtenData.readUInt8(4), 6); // REQUEST message type
      assert.strictEqual(writtenData.readUInt32BE(5), 5); // Index
      assert.strictEqual(writtenData.readUInt32BE(9), 16384); // Offset
      assert.strictEqual(writtenData.readUInt32BE(13), 8192); // Length
    });
  });

  describe('sendInterested', () => {
    it('should send interested message and update state', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      peer.connected = true;

      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      peer.sendInterested();

      assert.strictEqual(peer.interested, true);
      assert.ok(writtenData);
      assert.strictEqual(writtenData.readUInt8(4), 2); // INTERESTED
    });
  });

  describe('sendNotInterested', () => {
    it('should send not interested message and update state', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      peer.connected = true;
      peer.interested = true;

      let writtenData = null;
      peer.socket = {
        write: (data) => { writtenData = data; }
      };

      peer.sendNotInterested();

      assert.strictEqual(peer.interested, false);
      assert.ok(writtenData);
      assert.strictEqual(writtenData.readUInt8(4), 3); // NOT_INTERESTED
    });
  });

  describe('handleHandshake', () => {
    it('should parse valid handshake', (t, done) => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash, testPeerId);
      
      // Create valid handshake buffer
      const handshake = Buffer.alloc(68);
      handshake.writeUInt8(19, 0);
      handshake.write('BitTorrent protocol', 1);
      testInfoHash.copy(handshake, 28);
      testPeerId.copy(handshake, 48);

      peer.buffer = handshake;
      peer.socket = { destroy: () => {} };

      peer.on('handshake', () => {
        assert.strictEqual(peer.handshakeReceived, true);
        assert.strictEqual(peer.buffer.length, 0);
        done();
      });

      peer.handleData();
    });

    it('should reject handshake with wrong protocol', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      
      const handshake = Buffer.alloc(68);
      handshake.writeUInt8(19, 0);
      handshake.write('WrongProtocol______', 1);
      testInfoHash.copy(handshake, 28);

      peer.buffer = handshake;
      
      let destroyed = false;
      peer.socket = { destroy: () => { destroyed = true; } };

      peer.handleData();
      assert.strictEqual(destroyed, true);
    });

    it('should reject handshake with wrong info hash', () => {
      const peer = new Peer('127.0.0.1', 6881, testInfoHash);
      
      const handshake = Buffer.alloc(68);
      handshake.writeUInt8(19, 0);
      handshake.write('BitTorrent protocol', 1);
      crypto.randomBytes(20).copy(handshake, 28); // Wrong info hash

      peer.buffer = handshake;
      
      let destroyed = false;
      peer.socket = { destroy: () => { destroyed = true; } };

      peer.handleData();
      assert.strictEqual(destroyed, true);
    });
  });
});
