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
  constructor(torrent, downloadPath = './downloads', debug = false) {
    super();
    this.torrent = torrent;
    this.downloadPath = downloadPath;
    this.pieceManager = new PieceManager(torrent);
    this.tracker = new Tracker(torrent);
    this.debug = debug;
    
    this.peers = [];
    this.activePeers = new Set();
    this.maxPeers = 50;
    this.maxActivePeers = 10;
    this.maxPiecesInProgress = 10; // More pieces for faster download
    this.piecesInProgress = new Map(); // Map pieceIndex -> { startTime, receivedBlocks, totalBlocks }
    
    this.downloading = false;
    this.startTime = null;
    this.fileHandle = null;
    this.bytesDownloaded = 0;
    this.lastProgressUpdate = Date.now();
    this.lastBytesDownloaded = 0;
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
      // Prepare output file
      await this.prepareFile();
      
      // Check for existing pieces and resume
      await this.resumeDownload();
      
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
      
      // Close file
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = null;
      }
      
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
        await peer.connect(3000);
        
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
      if (this.debug) console.log(`\nHandshake complete with ${peer.ip}:${peer.port}`);
      peer.sendInterested();
    });

    peer.on('bitfield', (bitfield) => {
      if (this.debug) console.log(`\nReceived bitfield from ${peer.ip}:${peer.port}`);
      peer.bitfield = bitfield;
    });

    peer.on('unchoke', () => {
      if (this.debug) console.log(`\nUnchoked by ${peer.ip}:${peer.port}`);
      this.activePeers.add(peer);
      this.requestPieces(peer);
    });

    peer.on('piece', (data) => {
      const { index, offset, data: block } = data;
      if (this.debug) console.log(`\nReceived block for piece ${index} offset ${offset} (${block.length} bytes)`);
      // Handle piece data asynchronously but don't await to avoid blocking
      this.handlePieceData(peer, index, offset, block).catch(err => {
        if (this.debug) {
          console.error(`\nError handling piece ${index}:`, err);
        }
      });
    });

    peer.on('close', () => {
      this.activePeers.delete(peer);
      const idx = this.peers.indexOf(peer);
      if (idx > -1) this.peers.splice(idx, 1);
    });

    peer.on('error', (error) => {
      // Log peer errors but don't crash - connection failures are normal
      if (this.debug) {
        console.error(`\nPeer ${peer.ip}:${peer.port} error:`, error.message);
      }
      this.activePeers.delete(peer);
      const idx = this.peers.indexOf(peer);
      if (idx > -1) this.peers.splice(idx, 1);
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
        
        this.displayProgress(progress);

        // Check for stalled pieces and reset them
        const now = Date.now();
        for (const [pieceIndex, info] of this.piecesInProgress.entries()) {
          const stalledTime = now - info.startTime;
          // If a piece hasn't completed in 30 seconds, reset and retry
          if (stalledTime > 30000) {
            console.log(`\nPiece ${pieceIndex} stalled, resetting...`);
            this.pieceManager.resetPiece(pieceIndex);
            this.piecesInProgress.delete(pieceIndex);
          }
        }

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

    // Try to request up to 2 pieces per peer, but respect the global limit
    for (let i = 0; i < 2; i++) {
      if (this.piecesInProgress.size >= this.maxPiecesInProgress) {
        break; // Don't start more pieces if we're at the limit
      }
      
      const pieceIndex = this.pieceManager.getNextPiece(peer.bitfield);
      if (pieceIndex === null) break;

      if (this.debug) console.log(`\nRequesting piece ${pieceIndex} from ${peer.ip}:${peer.port}`);
      const pieceSize = this.pieceManager.getPieceSize(pieceIndex);
      const totalBlocks = Math.ceil(pieceSize / this.pieceManager.blockSize);
      this.piecesInProgress.set(pieceIndex, { startTime: Date.now(), receivedBlocks: 0, totalBlocks });
      this.requestPieceBlocks(peer, pieceIndex);
    }
  }

  /**
   * Request blocks for a piece (limited to prevent memory overflow)
   */
  requestPieceBlocks(peer, pieceIndex) {
    let block;
    let count = 0;
    // Request all remaining blocks for this piece
    while ((block = this.pieceManager.getNextBlock(pieceIndex)) !== null) {
      peer.requestPiece(pieceIndex, block.offset, block.length);
      count++;
    }
    if (this.debug && count > 0) console.log(`  Requested ${count} blocks for piece ${pieceIndex}`);
    
    // Update start time if we're requesting blocks for an existing piece
    if (count > 0 && this.piecesInProgress.has(pieceIndex)) {
      this.piecesInProgress.get(pieceIndex).startTime = Date.now();
    }
  }

  /**
   * Handle received piece data
   */
  async handlePieceData(peer, pieceIndex, offset, block) {
    this.bytesDownloaded += block.length;
    
    // Update piece progress
    if (this.piecesInProgress.has(pieceIndex)) {
      this.piecesInProgress.get(pieceIndex).receivedBlocks++;
    }
    
    const isComplete = this.pieceManager.addBlock(pieceIndex, offset, block);

    if (isComplete) {
      if (this.debug) console.log(`\nPiece ${pieceIndex} complete, verifying...`);
      const verified = this.pieceManager.verifyPiece(pieceIndex);
      
      if (verified) {
        if (this.debug) console.log(`Piece ${pieceIndex} verified! Writing to disk...`);
        // Write piece to disk immediately
        await this.writePieceToDisk(pieceIndex);
        
        // Release piece data from memory
        this.pieceManager.releasePiece(pieceIndex);
        
        // Remove from in-progress tracking
        this.piecesInProgress.delete(pieceIndex);
        
        // Emit event
        this.emit('piece-complete', pieceIndex);
        
        // Request more pieces now that we have space
        this.requestPieces(peer);
      } else {
        // Verification failed, re-request
        console.log(`\nPiece ${pieceIndex} failed verification, re-requesting...`);
        this.pieceManager.resetPiece(pieceIndex);
        this.piecesInProgress.delete(pieceIndex);
        this.requestPieceBlocks(peer, pieceIndex);
        this.piecesInProgress.add(pieceIndex);
      }
    } else {
      // Piece not complete yet, request more blocks
      if (this.debug) {
        const blockInfo = this.pieceManager.blocks.get(pieceIndex);
        const received = blockInfo ? blockInfo.size : 0;
        const pieceSize = this.pieceManager.getPieceSize(pieceIndex);
        const total = Math.ceil(pieceSize / this.pieceManager.blockSize);
        console.log(`  Piece ${pieceIndex}: ${received}/${total} blocks received`);
      }
      this.requestPieceBlocks(peer, pieceIndex);
    }
  }

  /**
   * Prepare output file for streaming writes
   */
  async prepareFile() {
    // Create download directory
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }

    const files = this.torrent.getFiles();
    const name = this.torrent.getName();
    
    if (files.length === 1) {
      // Single file torrent
      const filePath = path.join(this.downloadPath, name);
      const totalSize = this.torrent.getSize();
      
      // Open file for reading and writing
      this.fileHandle = await fs.promises.open(filePath, fs.existsSync(filePath) ? 'r+' : 'w');
      
      // Pre-allocate file space if new
      if (!fs.existsSync(filePath)) {
        await this.fileHandle.truncate(totalSize);
      }
    } else {
      // Multi-file torrent - create directory and prepare all files
      const baseDir = path.join(this.downloadPath, name);
      this.fileHandles = [];
      this.fileOffsets = [];
      
      let offset = 0;
      for (const file of files) {
        const filePath = path.join(baseDir, file.path);
        const fileDir = path.dirname(filePath);
        
        // Create directory structure
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        
        // Open file and pre-allocate
        const handle = await fs.promises.open(filePath, fs.existsSync(filePath) ? 'r+' : 'w');
        if (!fs.existsSync(filePath)) {
          await handle.truncate(file.length);
        }
        
        this.fileHandles.push(handle);
        this.fileOffsets.push({ start: offset, end: offset + file.length, handle, path: filePath });
        offset += file.length;
      }
    }
  }

  /**
   * Resume download by checking existing pieces
   */
  async resumeDownload() {
    console.log('Checking for existing pieces...');
    let verified = 0;
    
    for (let i = 0; i < this.pieceManager.numPieces; i++) {
      try {
        // Read piece from disk
        const pieceData = await this.readPieceFromDisk(i);
        if (!pieceData) continue;
        
        // Store temporarily and verify
        this.pieceManager.pieces[i] = pieceData;
        if (this.pieceManager.verifyPiece(i)) {
          verified++;
          this.bytesDownloaded += pieceData.length;
        } else {
          // Clear invalid piece
          this.pieceManager.pieces[i] = null;
        }
      } catch (err) {
        // Piece doesn't exist or can't be read, will download
      }
    }
    
    if (verified > 0) {
      const progress = this.pieceManager.getProgress();
      console.log(`Resuming: ${verified} pieces verified (${progress.percentage}%)`);
    }
  }

  /**
   * Read a piece from disk
   */
  async readPieceFromDisk(pieceIndex) {
    const pieceSize = this.pieceManager.getPieceSize(pieceIndex);
    const pieceOffset = pieceIndex * this.pieceManager.pieceLength;
    const buffer = Buffer.alloc(pieceSize);
    
    if (this.fileHandle) {
      // Single file
      const result = await this.fileHandle.read(buffer, 0, pieceSize, pieceOffset);
      return result.bytesRead === pieceSize ? buffer : null;
    } else if (this.fileHandles) {
      // Multi-file - need to read across files
      let bytesRead = 0;
      let currentOffset = pieceOffset;
      
      for (const fileInfo of this.fileOffsets) {
        if (currentOffset >= fileInfo.end || bytesRead >= pieceSize) break;
        if (currentOffset + pieceSize <= fileInfo.start) continue;
        
        const fileStart = Math.max(0, fileInfo.start - currentOffset);
        const fileEnd = Math.min(pieceSize, fileInfo.end - currentOffset);
        const length = fileEnd - fileStart;
        
        if (length > 0) {
          const filePosition = currentOffset + fileStart - fileInfo.start;
          const result = await fileInfo.handle.read(buffer, bytesRead, length, filePosition);
          bytesRead += result.bytesRead;
        }
      }
      
      return bytesRead === pieceSize ? buffer : null;
    }
    
    return null;
  }

  /**
   * Write a verified piece to disk
   */
  async writePieceToDisk(pieceIndex) {
    const piece = this.pieceManager.getPiece(pieceIndex);
    if (!piece) return;
    
    const pieceOffset = pieceIndex * this.pieceManager.pieceLength;
    
    if (this.fileHandle) {
      // Single file - simple write
      await this.fileHandle.write(piece, 0, piece.length, pieceOffset);
    } else if (this.fileHandles) {
      // Multi-file - need to split piece across files
      let piecePosition = 0;
      let currentOffset = pieceOffset;
      
      for (const fileInfo of this.fileOffsets) {
        // Check if this piece overlaps with this file
        if (currentOffset < fileInfo.end && currentOffset + piece.length > fileInfo.start) {
          // Calculate the overlap
          const fileStart = Math.max(0, fileInfo.start - currentOffset);
          const fileEnd = Math.min(piece.length, fileInfo.end - currentOffset);
          const length = fileEnd - fileStart;
          
          if (length > 0) {
            const filePosition = currentOffset + fileStart - fileInfo.start;
            await fileInfo.handle.write(piece, fileStart, length, filePosition);
          }
        }
        
        // Move to next file if we've passed this one
        if (currentOffset + piece.length <= fileInfo.end) {
          break;
        }
      }
    }
  }

  /**
   * Save downloaded data to disk (legacy method for complete download)
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
  async cleanup() {
    // Close file handle(s)
    if (this.fileHandle) {
      try {
        await this.fileHandle.close();
      } catch (err) {
        if (this.debug) console.error('Error closing file:', err);
      }
      this.fileHandle = null;
    }
    
    if (this.fileHandles) {
      for (const fileInfo of this.fileOffsets) {
        try {
          await fileInfo.handle.close();
        } catch (err) {
          if (this.debug) console.error('Error closing file:', fileInfo.path, err);
        }
      }
      this.fileHandles = [];
      this.fileOffsets = [];
    }
    
    // Disconnect peers
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

  /**
   * Display enhanced progress with bars and statistics
   */
  displayProgress(progress) {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    const timeSinceLastUpdate = (now - this.lastProgressUpdate) / 1000;
    const bytesSinceLastUpdate = this.bytesDownloaded - this.lastBytesDownloaded;
    const speed = timeSinceLastUpdate > 0 ? bytesSinceLastUpdate / timeSinceLastUpdate : 0;
    const eta = speed > 0 ? (this.torrent.getSize() - this.bytesDownloaded) / speed : 0;
    
    // Update tracking
    this.lastProgressUpdate = now;
    this.lastBytesDownloaded = this.bytesDownloaded;
    
    // Build output as string array
    const lines = [];
    
    lines.push('='.repeat(70));
    lines.push(`Dauphin 🐬 - ${this.torrent.getName()}`);
    lines.push('='.repeat(70));
    lines.push('');
    
    // Overall progress bar
    const barWidth = 50;
    const filled = Math.floor(barWidth * (progress.completed / progress.total));
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    lines.push(`Overall: [${bar}] ${progress.percentage}%`);
    lines.push(`Pieces: ${progress.completed}/${progress.total} completed`);
    lines.push(`Downloaded: ${formatBytes(this.bytesDownloaded)} / ${formatBytes(this.torrent.getSize())}`);
    lines.push(`Speed: ${formatBytes(speed)}/s`);
    lines.push(`ETA: ${this.formatTime(eta)}`);
    lines.push(`Peers: ${this.activePeers.size} active / ${this.peers.length} connected`);
    lines.push('');
    
    // Pieces in progress
    if (this.piecesInProgress.size > 0) {
      lines.push('Downloading:');
      const sortedPieces = Array.from(this.piecesInProgress.entries()).slice(0, 5);
      for (const [pieceIndex, info] of sortedPieces) {
        const pct = ((info.receivedBlocks / info.totalBlocks) * 100).toFixed(1);
        const pieceBarWidth = 30;
        const pieceFilled = Math.floor(pieceBarWidth * (info.receivedBlocks / info.totalBlocks));
        const pieceBar = '▓'.repeat(pieceFilled) + '░'.repeat(pieceBarWidth - pieceFilled);
        lines.push(`  Piece ${pieceIndex.toString().padStart(4)}: [${pieceBar}] ${pct}% (${info.receivedBlocks}/${info.totalBlocks} blocks)`);
      }
      if (this.piecesInProgress.size > 5) {
        lines.push(`  ... and ${this.piecesInProgress.size - 5} more`);
      }
    } else {
      lines.push('Downloading:');
      lines.push('  (waiting for pieces...)');
    }
    
    // Clear screen, move cursor to home, and write all lines
    process.stdout.write('\x1B[2J\x1B[H' + lines.join('\n'));
  }

  /**
   * Format time in seconds to human readable
   */
  formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

export default Downloader;
