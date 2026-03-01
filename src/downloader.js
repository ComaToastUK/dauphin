import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { Tracker } from './tracker.js';
import { Peer } from './peer.js';
import { PieceManager } from './pieces.js';
import { formatBytes } from './utils.js';

/**
 * Main downloader that coordinates the torrent download
 */
export class Downloader extends EventEmitter {
  constructor(torrent, downloadPath = './downloads') {
    super();
    this.torrent = torrent;
    this.downloadPath = downloadPath;
    this.pieceManager = new PieceManager(torrent);
    this.tracker = new Tracker(torrent);
    
    this.peers = [];
    this.activePeers = new Set();
    this.maxPeers = 30;
    this.maxActivePeers = 5;
    
    this.downloading = false;
    this.startTime = null;
  }

  /**
   * Start the download
   */
  async start() {
    this.downloading = true;
    this.startTime = Date.now();
    
    console.log(`Starting download: ${this.torrent.getName()}`);
    console.log(`Size: ${formatBytes(this.torrent.getSize())}`);
    console.log(`Pieces: ${this.torrent.getNumPieces()}`);
    console.log('');

    try {
      // Get peers from tracker
      this.emit('status', 'Contacting tracker...');
      const peers = await this.tracker.getPeers();
      console.log(`Found ${peers.length} peers`);
      
      // Connect to peers
      this.emit('status', 'Connecting to peers...');
      await this.connectToPeers(peers);
      
      // Start download loop
      this.emit('status', 'Downloading...');
      await this.downloadLoop();
      
      // Save to disk
      this.emit('status', 'Writing to disk...');
      await this.saveToDisk();
      
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
      console.log(`\n✓ Download complete in ${elapsed}s`);
      this.emit('complete');
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Connect to peers
   */
  async connectToPeers(peerList) {
    const promises = peerList.slice(0, this.maxPeers).map(async (peerInfo) => {
      try {
        const peer = new Peer(peerInfo.ip, peerInfo.port, this.torrent.getInfoHash());
        await peer.connect(5000);
        
        // Set up peer event handlers
        this.setupPeerHandlers(peer);
        
        this.peers.push(peer);
        return peer;
      } catch (error) {
        // Silently fail for individual peer connections
        return null;
      }
    });

    const results = await Promise.allSettled(promises);
    const connected = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
    console.log(`Connected to ${connected} peers`);
  }

  /**
   * Set up event handlers for a peer
   */
  setupPeerHandlers(peer) {
    peer.on('handshake', () => {
      peer.sendInterested();
    });

    peer.on('bitfield', (bitfield) => {
      peer.bitfield = bitfield;
    });

    peer.on('unchoke', () => {
      this.activePeers.add(peer);
      this.requestPieces(peer);
    });

    peer.on('piece', (data) => {
      const { index, offset, data: block } = data;
      this.handlePieceData(peer, index, offset, block);
    });

    peer.on('close', () => {
      this.activePeers.delete(peer);
    });

    peer.on('error', () => {
      this.activePeers.delete(peer);
    });
  }

  /**
   * Main download loop
   */
  async downloadLoop() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // Update progress
        const progress = this.pieceManager.getProgress();
        this.emit('progress', progress);
        
        process.stdout.write(`\rProgress: ${progress.percentage}% (${progress.completed}/${progress.total} pieces)`);

        // Request more pieces from active peers
        for (const peer of this.activePeers) {
          if (!peer.choked) {
            this.requestPieces(peer);
          }
        }

        // Check if complete
        if (this.pieceManager.isComplete()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!this.pieceManager.isComplete()) {
          resolve(); // Partial download
        }
      }, 300000);
    });
  }

  /**
   * Request pieces from a peer
   */
  requestPieces(peer) {
    if (!peer.bitfield) return;

    // Try to request up to 5 pieces
    for (let i = 0; i < 5; i++) {
      const pieceIndex = this.pieceManager.getNextPiece(peer.bitfield);
      if (pieceIndex === null) break;

      this.requestPieceBlocks(peer, pieceIndex);
    }
  }

  /**
   * Request all blocks for a piece
   */
  requestPieceBlocks(peer, pieceIndex) {
    let block;
    while ((block = this.pieceManager.getNextBlock(pieceIndex)) !== null) {
      peer.requestPiece(pieceIndex, block.offset, block.length);
    }
  }

  /**
   * Handle received piece data
   */
  handlePieceData(peer, pieceIndex, offset, block) {
    const isComplete = this.pieceManager.addBlock(pieceIndex, offset, block);

    if (isComplete) {
      const verified = this.pieceManager.verifyPiece(pieceIndex);
      
      if (verified) {
        // Piece verified, emit event
        this.emit('piece-complete', pieceIndex);
      } else {
        // Verification failed, re-request
        console.log(`\nPiece ${pieceIndex} failed verification, re-requesting...`);
        this.requestPieceBlocks(peer, pieceIndex);
      }
    }
  }

  /**
   * Save downloaded data to disk
   */
  async saveToDisk() {
    // Create download directory
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }

    const files = this.torrent.getFiles();
    const name = this.torrent.getName();

    if (files.length === 1) {
      // Single file
      const filePath = path.join(this.downloadPath, name);
      const fileData = this.assemblePieces();
      fs.writeFileSync(filePath, fileData);
      console.log(`Saved: ${filePath}`);
    } else {
      // Multi-file torrent
      const baseDir = path.join(this.downloadPath, name);
      const fileData = this.assemblePieces();
      let offset = 0;

      for (const file of files) {
        const filePath = path.join(baseDir, file.path);
        const fileDir = path.dirname(filePath);
        
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        const fileBuffer = fileData.slice(offset, offset + file.length);
        fs.writeFileSync(filePath, fileBuffer);
        console.log(`Saved: ${filePath}`);
        
        offset += file.length;
      }
    }
  }

  /**
   * Assemble all pieces into a single buffer
   */
  assemblePieces() {
    const buffers = [];
    for (let i = 0; i < this.pieceManager.numPieces; i++) {
      const piece = this.pieceManager.getPiece(i);
      if (piece) {
        buffers.push(piece);
      }
    }
    return Buffer.concat(buffers);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    for (const peer of this.peers) {
      peer.disconnect();
    }
    this.peers = [];
    this.activePeers.clear();
    this.downloading = false;
  }

  /**
   * Stop the download
   */
  stop() {
    this.downloading = false;
    this.cleanup();
    this.emit('stopped');
  }
}

export default Downloader;
