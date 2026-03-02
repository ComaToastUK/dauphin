#!/bin/bash
# Test workflow locally before pushing to GitHub
# This simulates what CI will run

set -e

echo "🧪 Running Local CI Tests..."
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm ci
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Test 2: Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
npm test
echo -e "${GREEN}✓ All tests passed${NC}"
echo ""

# Test 3: Build package
echo -e "${BLUE}📦 Building package...${NC}"
npm pack --dry-run > /dev/null
echo -e "${GREEN}✓ Package builds successfully${NC}"
echo ""

# Test 4: Check for common issues
echo -e "${BLUE}🔍 Running additional checks...${NC}"

# Check for large files
echo "  - Checking for large files..."
LARGE_FILES=$(find . -type f -size +1M -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null || true)
if [ -n "$LARGE_FILES" ]; then
  echo -e "${RED}  ⚠️  Warning: Large files found:${NC}"
  echo "$LARGE_FILES"
else
  echo -e "${GREEN}  ✓ No large files${NC}"
fi

# Check package.json version
echo "  - Checking package version..."
VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}  ✓ Current version: v$VERSION${NC}"

# Check for uncommitted changes
echo "  - Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}  ⚠️  Uncommitted changes detected${NC}"
else
  echo -e "${GREEN}  ✓ Working directory clean${NC}"
fi

echo ""
echo "================================"
echo -e "${GREEN}✓ All local checks passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. git push"
echo "  2. Watch Actions tab on GitHub"
echo "  3. Create release when ready"
echo ""
