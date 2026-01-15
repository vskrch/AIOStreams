/**
 * Heroku Post-Build Cleanup Script
 * Removes unnecessary files and devDependencies to reduce slug size
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 Starting Heroku cleanup...');

// Directories to remove
const dirsToRemove = [
  'node_modules/.cache',
  'packages/frontend/.next/cache',
  '.git',
];

// File patterns to remove from node_modules
const patternsToRemove = [
  '*.md',
  '*.ts',
  '!*.d.ts',
  'LICENSE*',
  'CHANGELOG*',
  '.eslintrc*',
  '.prettierrc*',
  'tsconfig.json',
  '*.map',
];

// Remove directories
for (const dir of dirsToRemove) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    console.log(`  Removing ${dir}...`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

// Remove TypeScript source files from node_modules (keep .d.ts)
try {
  console.log('  Removing .ts files from node_modules (keeping .d.ts)...');
  execSync('find node_modules -name "*.ts" ! -name "*.d.ts" -type f -delete 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (e) {
  // Ignore errors
}

// Remove source maps
try {
  console.log('  Removing source maps from node_modules...');
  execSync('find node_modules -name "*.map" -type f -delete 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (e) {
  // Ignore errors
}

// Remove unnecessary docs and configs from node_modules
try {
  console.log('  Removing docs and configs from node_modules...');
  execSync('find node_modules -name "*.md" -type f -delete 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  execSync('find node_modules -name "CHANGELOG*" -type f -delete 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (e) {
  // Ignore errors
}

// Remove test directories
try {
  console.log('  Removing test directories from node_modules...');
  execSync('find node_modules -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  execSync('find node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  execSync('find node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (e) {
  // Ignore errors
}

console.log('✅ Heroku cleanup complete!');
