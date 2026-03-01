import net from 'net';
import { EventEmitter } from 'events';
import { generatePeerId } from './utils.js';

/**
 * BitTorrent Peer Wire Protocol Message Types
 */
const MESSAGE_TYPE = {
  CHOKE: 0,
  UNCHOKE: 1,
  INTERESTED: 2,
  NOT_INTERESTED: 3,
  HAVE: 4,
  BITFIELD: 5,
  REQUEST: 6,
  PIECE: 7,
  CANCEL: 8
};

/**
 * Peer connection handler
 */
export class Peer extends EventEmitter {
  constructor(ip, port, infoHash, peerId = null) {
    super();
    this.ip = ip;
    this.port = port;
    this.infoHash = infoHash;
    this.peerId = peerId || generatePeerId();
    
    this.socket = null;
    this.bitfield = null;
    this.choked = true;
    this.interested = false;
    this.connected = false;
    
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Connect to peer
   */
  connect(timeout = 10000) {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      const timeoutId = setTimeout(() => {
        this.socket.destroy();
        reject(new Error('Connection timeout'));
      }, timeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        this.connected = true;
        this.sendHandshake();
      });

      this.socket.on('data', (data) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        this.handleData();
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeoutId);
        this.emit('error', error);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('close');
      });

      this.socket.connect(this.port, this.ip, () => {
        // Wait for handshake response
        const handshakeTimeout = setTimeout(() => {
          this.socket.destroy();
          reject(new Error('Handshake timeout'));
        }, 5000);

        this.once('handshake', () => {
          clearTimeout(handshakeTimeout);
          resolve();
        });
      });
    });
  }

  /**
   * Send handshake
   */
  sendHandshake() {
    const handshake = Buffer.alloc(68);
    handshake.writeUInt8(19, 0);
    handshake.write('BitTorrent protocol', 1);
    handshake.fill(0, 20, 28); // Reserved bytes
    this.infoHash.copy(handshake, 28);
    this.peerId.copy(handshake, 48);
    
    this.socket.write(handshake);
  }

  /**
   * Handle incoming data
   */
  handleData() {
    // Parse handshake first
    if (!this.handshakeReceived && this.buffer.length >= 68) {
      this.handleHandshake();
      return;
    }

    // Parse messages
    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);
      
      if (messageLength === 0) {
        // Keep-alive
        this.buffer = this.buffer.slice(4);
        continue;
      }

      if (this.buffer.length < 4 + messageLength) {
        // Incomplete message
        break;
      }

      const messageId = this.buffer.readUInt8(4);
      const payload = this.buffer.slice(5, 4 + messageLength);
      
      this.handleMessage(messageId, payload);
      this.buffer = this.buffer.slice(4 + messageLength);
    }
  }

  /**
   * Handle handshake
   */
  handleHandshake() {
    if (this.buffer[0] !== 19) {
      this.socket.destroy();
      return;
    }

    const protocol = this.buffer.slice(1, 20).toString();
    if (protocol !== 'BitTorrent protocol') {
      this.socket.destroy();
      return;
    }

    const infoHash = this.buffer.slice(28, 48);
    if (!infoHash.equals(this.infoHash)) {
      this.socket.destroy();
      return;
    }

    this.handshakeReceived = true;
    this.buffer = this.buffer.slice(68);
    this.emit('handshake');
  }

  /**
   * Handle peer message
   */
  handleMessage(messageId, payload) {
    switch (messageId) {
      case MESSAGE_TYPE.CHOKE:
        this.choked = true;
        this.emit('choke');
        break;

      case MESSAGE_TYPE.UNCHOKE:
        this.choked = false;
        this.emit('unchoke');
        break;

      case MESSAGE_TYPE.INTERESTED:
        this.emit('interested');
        break;

      case MESSAGE_TYPE.NOT_INTERESTED:
        this.emit('not-interested');
        break;

      case MESSAGE_TYPE.HAVE:
        const pieceIndex = payload.readUInt32BE(0);
        this.emit('have', pieceIndex);
        break;

      case MESSAGE_TYPE.BITFIELD:
        this.bitfield = payload;
        this.emit('bitfield', payload);
        break;

      case MESSAGE_TYPE.REQUEST:
        const index = payload.readUInt32BE(0);
        const offset = payload.readUInt32BE(4);
        const length = payload.readUInt32BE(8);
        this.emit('request', { index, offset, length });
        break;

      case MESSAGE_TYPE.PIECE:
        const pieceIdx = payload.readUInt32BE(0);
        const blockOffset = payload.readUInt32BE(4);
        const block = payload.slice(8);
        this.emit('piece', { index: pieceIdx, offset: blockOffset, data: block });
        break;

      case MESSAGE_TYPE.CANCEL:
        this.emit('cancel', {
          index: payload.readUInt32BE(0),
          offset: payload.readUInt32BE(4),
          length: payload.readUInt32BE(8)
        });
        break;
    }
  }

  /**
   * Send interested message
   */
  sendInterested() {
    this.interested = true;
    this.sendMessage(MESSAGE_TYPE.INTERESTED);
  }

  /**
   * Send not interested message
   */
  sendNotInterested() {
    this.interested = false;
    this.sendMessage(MESSAGE_TYPE.NOT_INTERESTED);
  }

  /**
   * Request a piece block
   */
  requestPiece(index, offset, length) {
    const payload = Buffer.alloc(12);
    payload.writeUInt32BE(index, 0);
    payload.writeUInt32BE(offset, 4);
    payload.writeUInt32BE(length, 8);
    this.sendMessage(MESSAGE_TYPE.REQUEST, payload);
  }

  /**
   * Send a message
   */
  sendMessage(type, payload = null) {
    if (!this.connected) return;

    const length = payload ? payload.length + 1 : 1;
    const message = Buffer.alloc(4 + length);
    
    message.writeUInt32BE(length, 0);
    message.writeUInt8(type, 4);
    
    if (payload) {
      payload.copy(message, 5);
    }

    this.socket.write(message);
  }

  /**
   * Send keep-alive
   */
  sendKeepAlive() {
    const message = Buffer.alloc(4);
    message.writeUInt32BE(0, 0);
    this.socket.write(message);
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.socket) {
      this.socket.destroy();
    }
  }
}

export default Peer;
