import fs from 'fs';
import crypto from 'crypto';

/**
 * Bencode decoder
 */
class Bencode {
  static decode(data) {
    if (typeof data === 'string') {
      data = Buffer.from(data);
    }
    return this._decode(data, 0).value;
  }

  static _decode(data, offset) {
    const char = String.fromCharCode(data[offset]);

    if (char === 'd') {
      // Dictionary
      return this._decodeDict(data, offset + 1);
    } else if (char === 'l') {
      // List
      return this._decodeList(data, offset + 1);
    } else if (char === 'i') {
      // Integer
      return this._decodeInt(data, offset + 1);
    } else if (char >= '0' && char <= '9') {
      // String/Bytes
      return this._decodeString(data, offset);
    } else {
      throw new Error(`Invalid bencode data at offset ${offset}`);
    }
  }

  static _decodeInt(data, offset) {
    const end = data.indexOf(0x65, offset); // 'e'
    const number = parseInt(data.slice(offset, end).toString());
    return { value: number, offset: end + 1 };
  }

  static _decodeString(data, offset) {
    const colon = data.indexOf(0x3a, offset); // ':'
    const length = parseInt(data.slice(offset, colon).toString());
    const start = colon + 1;
    const value = data.slice(start, start + length);
    return { value, offset: start + length };
  }

  static _decodeList(data, offset) {
    const list = [];
    while (data[offset] !== 0x65) { // 'e'
      const result = this._decode(data, offset);
      list.push(result.value);
      offset = result.offset;
    }
    return { value: list, offset: offset + 1 };
  }

  static _decodeDict(data, offset) {
    const dict = {};
    while (data[offset] !== 0x65) { // 'e'
      const keyResult = this._decodeString(data, offset);
      const key = keyResult.value.toString();
      const valueResult = this._decode(data, keyResult.offset);
      dict[key] = valueResult.value;
      offset = valueResult.offset;
    }
    return { value: dict, offset: offset + 1 };
  }
}

/**
 * Parse a .torrent file
 */
export class TorrentParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.torrent = null;
  }

  parse() {
    const data = fs.readFileSync(this.filePath);
    this.torrent = Bencode.decode(data);
    return this;
  }

  // Get announce URL (primary tracker)
  getAnnounce() {
    return this.torrent.announce?.toString() || null;
  }

  // Get all announce URLs (including backup trackers)
  getAnnounceList() {
    const list = [];
    
    if (this.torrent['announce-list']) {
      this.torrent['announce-list'].forEach(tier => {
        tier.forEach(url => {
          list.push(url.toString());
        });
      });
    }
    
    // Add primary announce if not in list
    const primary = this.getAnnounce();
    if (primary && !list.includes(primary)) {
      list.unshift(primary);
    }
    
    return list;
  }

  // Get info hash (20-byte SHA1 hash of info dictionary)
  getInfoHash() {
    const info = this.torrent.info;
    const bencodedInfo = this._encode(info);
    return crypto.createHash('sha1').update(bencodedInfo).digest();
  }

  // Get total size of all files
  getSize() {
    const info = this.torrent.info;
    
    if (info.files) {
      // Multi-file torrent
      return info.files.reduce((total, file) => total + file.length, 0);
    } else {
      // Single file torrent
      return info.length;
    }
  }

  // Get piece length
  getPieceLength() {
    return this.torrent.info['piece length'];
  }

  // Get number of pieces
  getNumPieces() {
    return this.torrent.info.pieces.length / 20;
  }

  // Get piece hash at index
  getPieceHash(index) {
    const start = index * 20;
    return this.torrent.info.pieces.slice(start, start + 20);
  }

  // Get all piece hashes
  getPieceHashes() {
    const hashes = [];
    const pieces = this.torrent.info.pieces;
    for (let i = 0; i < pieces.length; i += 20) {
      hashes.push(pieces.slice(i, i + 20));
    }
    return hashes;
  }

  // Get torrent name
  getName() {
    return this.torrent.info.name?.toString() || 'unknown';
  }

  // Get file list
  getFiles() {
    const info = this.torrent.info;
    
    if (info.files) {
      // Multi-file torrent
      return info.files.map(file => ({
        path: file.path.map(p => p.toString()).join('/'),
        length: file.length
      }));
    } else {
      // Single file torrent
      return [{
        path: info.name.toString(),
        length: info.length
      }];
    }
  }

  // Simple bencode encoder (for info hash)
  _encode(obj) {
    if (Buffer.isBuffer(obj)) {
      return Buffer.concat([Buffer.from(obj.length + ':'), obj]);
    } else if (typeof obj === 'number') {
      return Buffer.from('i' + obj + 'e');
    } else if (Array.isArray(obj)) {
      const encoded = obj.map(item => this._encode(item));
      return Buffer.concat([Buffer.from('l'), ...encoded, Buffer.from('e')]);
    } else if (typeof obj === 'object') {
      const encoded = [];
      Object.keys(obj).sort().forEach(key => {
        encoded.push(this._encode(key));
        encoded.push(this._encode(obj[key]));
      });
      return Buffer.concat([Buffer.from('d'), ...encoded, Buffer.from('e')]);
    } else if (typeof obj === 'string') {
      return Buffer.from(obj.length + ':' + obj);
    }
    throw new Error('Unsupported type for encoding');
  }
}

export default TorrentParser;
