#!/usr/bin/env node
/**
 * FAUST Post-Build Script
 * Copies critical CSS/assets to dist and verifies they exist
 */

const fs = require('fs-extra');
const path = require('path');

const CRITICAL_FILES = [
  { src: 'styles/faust-theme.css', dst: 'dist/styles/faust-theme.css' },
  { src: 'styles/faust-layout.css', dst: 'dist/styles/faust-layout.css' },
  { src: 'utils/dictionaries/fi-basic.json', dst: 'dist/utils/dictionaries/fi-basic.json' }
];

async function main() {
  console.log('📦 Post-build: Starting...');
  
  let errors = [];
  let copied = [];

  for (const { src, dst } of CRITICAL_FILES) {
    const srcPath = path.join(__dirname, '..', src);
    const dstPath = path.join(__dirname, '..', dst);
    
    try {
      // Check source exists
      if (!await fs.pathExists(srcPath)) {
        errors.push(`Source not found: ${src}`);
        continue;
      }

      // Ensure dest directory exists
      await fs.ensureDir(path.dirname(dstPath));
      
      // Copy file
      await fs.copy(srcPath, dstPath);
      copied.push(src);
      
      // Verify copy
      if (!await fs.pathExists(dstPath)) {
        errors.push(`Copy failed: ${src} → ${dst}`);
      }
    } catch (error) {
      errors.push(`Error copying ${src}: ${error.message}`);
    }
  }

  // Report
  if (copied.length > 0) {
    console.log('✅ Copied:', copied.join(', '));
  }

  if (errors.length > 0) {
    console.error('❌ Post-build errors:');
    errors.forEach(e => console.error('  -', e));
    process.exit(1);
  }

  console.log('✅ Post-build: Complete!');
}

main().catch(error => {
  console.error('❌ Post-build failed:', error);
  process.exit(1);
});

