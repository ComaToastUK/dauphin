import dgram from 'dgram';
import { URL } from 'url';
import crypto from 'crypto';
import { generatePeerId } from './utils.js';

/**
 * Tracker client for HTTP and UDP protocols
 */
export class Tracker {
  constructor(torrent) {
    this.torrent = torrent;
    this.peerId = generatePeerId();
    this.port = 6881;
  }

  /**
   * Get peers from tracker
   */
  async getPeers(downloaded = 0, uploaded = 0, left = null) {
    const announceList = this.torrent.getAnnounceList();
    left = left ?? this.torrent.getSize();

    for (const announceUrl of announceList) {
      try {
        const url = new URL(announceUrl);
        
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          return await this._httpAnnounce(announceUrl, downloaded, uploaded, left);
        } else if (url.protocol === 'udp:') {
          return await this._udpAnnounce(announceUrl, downloaded, uploaded, left);
        }
      } catch (error) {
        console.error(`Failed to contact tracker ${announceUrl}:`, error.message);
        // Try next tracker
        continue;
      }
    }

    throw new Error('All trackers failed');
  }

  /**
   * HTTP tracker announce
   */
  async _httpAnnounce(announceUrl, downloaded, uploaded, left) {
    const params = new URLSearchParams({
      info_hash: this.torrent.getInfoHash().toString('binary'),
      peer_id: this.peerId.toString('binary'),
      port: this.port.toString(),
      uploaded: uploaded.toString(),
      downloaded: downloaded.toString(),
      left: left.toString(),
      compact: '1',
      event: 'started'
    });

    // URL encode info_hash and peer_id properly
    const url = announceUrl + '?' + 
      params.toString()
        .replace(/info_hash=[^&]*/, 'info_hash=' + this._urlEncodeBytes(this.torrent.getInfoHash()))
        .replace(/peer_id=[^&]*/, 'peer_id=' + this._urlEncodeBytes(this.peerId));

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return this._parseHttpResponse(buffer);
  }

  /**
   * UDP tracker announce
   */
  async _udpAnnounce(announceUrl, downloaded, uploaded, left) {
    const url = new URL(announceUrl);
    const socket = dgram.createSocket('udp4');

    try {
      // Step 1: Connect
      const connectionId = await this._udpConnect(socket, url.hostname, parseInt(url.port) || 80);
      
      // Step 2: Announce
      const peers = await this._udpAnnounceRequest(socket, url.hostname, parseInt(url.port) || 80, connectionId, downloaded, uploaded, left);
      
      socket.close();
      return peers;
    } catch (error) {
      socket.close();
      throw error;
    }
  }

  _udpConnect(socket, host, port) {
    return new Promise((resolve, reject) => {
      const connectionRequest = Buffer.alloc(16);
      connectionRequest.writeBigUInt64BE(0x41727101980n, 0); // Protocol ID
      connectionRequest.writeUInt32BE(0, 8); // Action: connect
      const transactionId = crypto.randomBytes(4).readUInt32BE(0);
      connectionRequest.writeUInt32BE(transactionId, 12);

      const timeout = setTimeout(() => {
        socket.removeAllListeners();
        reject(new Error('UDP connect timeout'));
      }, 15000);

      socket.once('message', (msg) => {
        clearTimeout(timeout);
        
        if (msg.length < 16) {
          return reject(new Error('Invalid connect response'));
        }

        const action = msg.readUInt32BE(0);
        const respTransactionId = msg.readUInt32BE(4);
        
        if (action !== 0 || respTransactionId !== transactionId) {
          return reject(new Error('Invalid connect response'));
        }

        const connectionId = msg.readBigUInt64BE(8);
        resolve(connectionId);
      });

      socket.send(connectionRequest, port, host, (error) => {
        if (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  _udpAnnounceRequest(socket, host, port, connectionId, downloaded, uploaded, left) {
    return new Promise((resolve, reject) => {
      const announceRequest = Buffer.alloc(98);
      
      announceRequest.writeBigUInt64BE(connectionId, 0);
      announceRequest.writeUInt32BE(1, 8); // Action: announce
      const transactionId = crypto.randomBytes(4).readUInt32BE(0);
      announceRequest.writeUInt32BE(transactionId, 12);
      this.torrent.getInfoHash().copy(announceRequest, 16);
      this.peerId.copy(announceRequest, 36);
      announceRequest.writeBigUInt64BE(BigInt(downloaded), 56);
      announceRequest.writeBigUInt64BE(BigInt(left), 64);
      announceRequest.writeBigUInt64BE(BigInt(uploaded), 72);
      announceRequest.writeUInt32BE(2, 80); // Event: started
      announceRequest.writeUInt32BE(0, 84); // IP address
      announceRequest.writeUInt32BE(0, 88); // Key
      announceRequest.writeInt32BE(-1, 92); // Num want
      announceRequest.writeUInt16BE(this.port, 96);

      const timeout = setTimeout(() => {
        socket.removeAllListeners();
        reject(new Error('UDP announce timeout'));
      }, 15000);

      socket.once('message', (msg) => {
        clearTimeout(timeout);
        
        if (msg.length < 20) {
          return reject(new Error('Invalid announce response'));
        }

        const action = msg.readUInt32BE(0);
        const respTransactionId = msg.readUInt32BE(4);
        
        if (action !== 1 || respTransactionId !== transactionId) {
          return reject(new Error('Invalid announce response'));
        }

        const peers = this._parseUdpPeers(msg.slice(20));
        resolve(peers);
      });

      socket.send(announceRequest, port, host, (error) => {
        if (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  _parseHttpResponse(buffer) {
    // Simple bencode parser for tracker response
    const response = this._decodeBencode(buffer, 0).value;
    
    if (response['failure reason']) {
      throw new Error('Tracker error: ' + response['failure reason'].toString());
    }

    const peersData = response.peers;
    
    if (Buffer.isBuffer(peersData)) {
      // Compact format
      return this._parseCompactPeers(peersData);
    } else {
      // Dictionary format
      return peersData.map(peer => ({
        ip: peer.ip.toString(),
        port: peer.port
      }));
    }
  }

  _parseCompactPeers(buffer) {
    const peers = [];
    for (let i = 0; i < buffer.length; i += 6) {
      peers.push({
        ip: `${buffer[i]}.${buffer[i + 1]}.${buffer[i + 2]}.${buffer[i + 3]}`,
        port: buffer.readUInt16BE(i + 4)
      });
    }
    return peers;
  }

  _parseUdpPeers(buffer) {
    const peers = [];
    for (let i = 0; i < buffer.length; i += 6) {
      peers.push({
        ip: `${buffer[i]}.${buffer[i + 1]}.${buffer[i + 2]}.${buffer[i + 3]}`,
        port: buffer.readUInt16BE(i + 4)
      });
    }
    return peers;
  }

  _decodeBencode(data, offset) {
    const char = String.fromCharCode(data[offset]);

    if (char === 'd') {
      return this._decodeBencodeDict(data, offset + 1);
    } else if (char === 'l') {
      return this._decodeBencodeList(data, offset + 1);
    } else if (char === 'i') {
      return this._decodeBencodeInt(data, offset + 1);
    } else if (char >= '0' && char <= '9') {
      return this._decodeBencodeString(data, offset);
    }
  }

  _decodeBencodeInt(data, offset) {
    const end = data.indexOf(0x65, offset);
    const number = parseInt(data.slice(offset, end).toString());
    return { value: number, offset: end + 1 };
  }

  _decodeBencodeString(data, offset) {
    const colon = data.indexOf(0x3a, offset);
    const length = parseInt(data.slice(offset, colon).toString());
    const start = colon + 1;
    const value = data.slice(start, start + length);
    return { value, offset: start + length };
  }

  _decodeBencodeList(data, offset) {
    const list = [];
    while (data[offset] !== 0x65) {
      const result = this._decodeBencode(data, offset);
      list.push(result.value);
      offset = result.offset;
    }
    return { value: list, offset: offset + 1 };
  }

  _decodeBencodeDict(data, offset) {
    const dict = {};
    while (data[offset] !== 0x65) {
      const keyResult = this._decodeBencodeString(data, offset);
      const key = keyResult.value.toString();
      const valueResult = this._decodeBencode(data, keyResult.offset);
      dict[key] = valueResult.value;
      offset = valueResult.offset;
    }
    return { value: dict, offset: offset + 1 };
  }

  _urlEncodeBytes(buffer) {
    let encoded = '';
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if ((byte >= 0x41 && byte <= 0x5A) || // A-Z
          (byte >= 0x61 && byte <= 0x7A) || // a-z
          (byte >= 0x30 && byte <= 0x39) || // 0-9
          byte === 0x2D || byte === 0x5F || byte === 0x2E || byte === 0x7E) { // - _ . ~
        encoded += String.fromCharCode(byte);
      } else {
        encoded += '%' + ('0' + byte.toString(16).toUpperCase()).slice(-2);
      }
    }
    return encoded;
  }
}

export default Tracker;
