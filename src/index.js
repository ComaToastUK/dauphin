#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { TorrentParser } from './torrent-parser.js';
import { Downloader } from './downloader.js';

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Dauphin - Lightweight BitTorrent Client');
    console.log('');
    console.log('Usage: node src/index.js <torrent-file>');
    console.log('');
    console.log('Example:');
    console.log('  node src/index.js ubuntu.torrent');
    console.log('');
    process.exit(1);
  }

  const torrentFile = args[0];

  // Check if torrent file exists
  if (!fs.existsSync(torrentFile)) {
    console.error(`Error: Torrent file not found: ${torrentFile}`);
    process.exit(1);
  }

  try {
    console.log('='.repeat(60));
    console.log('Dauphin 🐬 - Lightweight BitTorrent Client');
    console.log('='.repeat(60));
    console.log('');

    // Parse torrent file
    console.log(`Loading: ${path.basename(torrentFile)}`);
    const parser = new TorrentParser(torrentFile);
    parser.parse();

    // Display torrent info
    console.log('');
    console.log('Torrent Information:');
    console.log('-'.repeat(60));
    console.log(`Name: ${parser.getName()}`);
    console.log(`Files: ${parser.getFiles().length}`);
    parser.getFiles().forEach(file => {
      console.log(`  - ${file.path} (${formatBytes(file.length)})`);
    });
    console.log(`Total Size: ${formatBytes(parser.getSize())}`);
    console.log(`Piece Size: ${formatBytes(parser.getPieceLength())}`);
    console.log(`Pieces: ${parser.getNumPieces()}`);
    console.log(`Trackers: ${parser.getAnnounceList().length}`);
    console.log('');
    console.log('-'.repeat(60));
    console.log('');

    // Start download
    const downloader = new Downloader(parser, './downloads');

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\nStopping download...');
      downloader.stop();
      process.exit(0);
    });

    // Handle errors
    downloader.on('error', (error) => {
      console.error('\nError:', error.message);
      process.exit(1);
    });

    // Start the download
    await downloader.start();

    console.log('');
    console.log('='.repeat(60));
    console.log('Download saved to: ./downloads');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nFatal error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the CLI
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
