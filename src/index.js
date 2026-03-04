#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TorrentParser } from './torrent-parser.js';
import { Downloader } from './downloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
);

/**
 * Display help message
 */
function showHelp() {
  console.log(`
Dauphin 🐬 - Lightweight BitTorrent Client v${packageJson.version}

USAGE:
  dauphin <torrent-file> [options]

OPTIONS:
  -o, --output <dir>     Output directory for downloads (default: ./downloads)
  -h, --help             Show this help message
  -v, --version          Show version number
  --debug                Enable debug mode

EXAMPLES:
  dauphin ubuntu.torrent
  dauphin file.torrent -o ~/Downloads
  dauphin file.torrent --output /path/to/folder

DESCRIPTION:
  A lightweight BitTorrent client with support for:
  - HTTP and UDP trackers (BEP 3, BEP 15)
  - Peer wire protocol
  - SHA-1 piece verification
  - Single and multi-file torrents

For more information, visit: ${packageJson.homepage || 'https://github.com/yourusername/dauphin'}
`);
}

/**
 * Display version
 */
function showVersion() {
  console.log(`v${packageJson.version}`);
}

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const parsed = {
    torrentFile: null,
    outputDir: './downloads',
    debug: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (arg === '-v' || arg === '--version') {
      showVersion();
      process.exit(0);
    } else if (arg === '-o' || arg === '--output') {
      parsed.outputDir = args[++i];
      if (!parsed.outputDir) {
        console.error('Error: --output requires a directory path');
        process.exit(1);
      }
    } else if (arg === '--debug') {
      parsed.debug = true;
    } else if (!arg.startsWith('-')) {
      if (!parsed.torrentFile) {
        parsed.torrentFile = arg;
      } else {
        console.error(`Error: Unexpected argument: ${arg}`);
        process.exit(1);
      }
    } else {
      console.error(`Error: Unknown option: ${arg}`);
      showHelp();
      process.exit(1);
    }
  }

  return parsed;
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Show help if no arguments
  if (args.length === 0) {
    showHelp();
    process.exit(1);
  }

  // Parse arguments
  const options = parseArgs(args);
  
  if (!options.torrentFile) {
    console.error('Error: No torrent file specified\n');
    showHelp();
    process.exit(1);
  }

  const torrentFile = options.torrentFile;

  // Check if torrent file exists
  if (!fs.existsSync(torrentFile)) {
    console.error(`Error: Torrent file not found: ${torrentFile}`);
    process.exit(1);
  }

  // Set debug mode
  if (options.debug) {
    process.env.DEBUG = '1';
  }

  try {
    console.log('='.repeat(60));
    console.log(`Dauphin 🐬 v${packageJson.version} - Lightweight BitTorrent Client`);
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
    const downloader = new Downloader(parser, options.outputDir, options.debug);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\nStopping download...');
      downloader.stop();
      process.exit(0);
    });

    // Handle errors
    downloader.on('error', (error) => {
      console.error('\nError:', error.message);
      if (options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    });

    // Start the download
    await downloader.start();

    console.log('');
    console.log('='.repeat(60));
    console.log(`Download saved to: ${path.resolve(options.outputDir)}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nFatal error:', error.message);
    if (options.debug) {
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
