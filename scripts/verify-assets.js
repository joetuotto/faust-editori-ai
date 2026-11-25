#!/usr/bin/env node
/**
 * FAUST Build Verification
 * Ensures all critical assets are in dist/
 */

const fs = require('fs-extra');
const path = require('path');

// The stylesheets are the ones index.html links, in its order (test/scripts/buildAssets.test.js)
const REQUIRED_ASSETS = [
  'dist/styles/faust-tokens.css',
  'dist/styles/faust-simple-layout.css',
  'dist/styles/faust-components.css',
  'dist/bundle.js',
  'dist/index.html'
];

const OPTIONAL_ASSETS = [
  'dist/vendor/react.production.min.js'
];

async function main() {
  console.log('🔍 Verifying build assets...');
  
  let missing = [];
  let found = [];
  let optional = [];

  // Check required
  for (const asset of REQUIRED_ASSETS) {
    const assetPath = path.join(__dirname, '..', asset);
    const exists = await fs.pathExists(assetPath);
    
    if (exists) {
      const stats = await fs.stat(assetPath);
      found.push(`${asset} (${Math.round(stats.size / 1024)}KB)`);
    } else {
      missing.push(asset);
    }
  }

  // Check optional
  for (const asset of OPTIONAL_ASSETS) {
    const assetPath = path.join(__dirname, '..', asset);
    const exists = await fs.pathExists(assetPath);
    
    if (exists) {
      optional.push(asset);
    } else {
      console.warn(`⚠️  Optional asset missing: ${asset}`);
    }
  }

  // Report
  if (found.length > 0) {
    console.log('✅ Found:');
    found.forEach(f => console.log(`   ${f}`));
  }

  if (optional.length > 0) {
    console.log('📎 Optional:');
    optional.forEach(f => console.log(`   ${f}`));
  }

  if (missing.length > 0) {
    console.error('❌ Missing required assets:');
    missing.forEach(m => console.error(`   ${m}`));
    process.exit(1);
  }

  console.log('✅ Build verification: PASS');
}

module.exports = { REQUIRED_ASSETS };

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

