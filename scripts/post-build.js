#!/usr/bin/env node
/**
 * FAUST Post-Build Script
 * Copies critical CSS/assets to dist and verifies they exist
 */

const fs = require('fs-extra');
const path = require('path');

const CRITICAL_FILES = [
  { src: 'styles/faust-theme.css', dst: 'dist/styles/faust-theme.css' },
  { src: 'styles/faust-simple-layout.css', dst: 'dist/styles/faust-simple-layout.css' },
  { src: 'styles/claude-chat.css', dst: 'dist/styles/claude-chat.css' },
  { src: 'build/character-engine-logo.png', dst: 'dist/build/character-engine-logo.png' },
  { src: 'utils/dictionaries/fi-basic.json', dst: 'dist/utils/dictionaries/fi-basic.json' },
  { src: 'utils/dictionaries/fi-expanded.txt', dst: 'dist/utils/dictionaries/fi-expanded.txt' },
  { src: 'src/utils/models.js', dst: 'dist/src/utils/models.js' },
  { src: 'src/utils/constants.js', dst: 'dist/src/utils/constants.js' },
  // Vendored runtime so the app works fully offline (no CDN)
  { src: 'vendor/react18/react.production.min.js', dst: 'dist/vendor/react.production.min.js' },
  { src: 'vendor/react18/react-dom.production.min.js', dst: 'dist/vendor/react-dom.production.min.js' },
  { src: 'src/utils/annotationTypes.js', dst: 'dist/src/utils/annotationTypes.js' },
  { src: 'src/utils/voiceInput.js', dst: 'dist/src/utils/voiceInput.js' },
  { src: 'src/utils/CommandManager.js', dst: 'dist/src/utils/CommandManager.js' },
  { src: 'src/services/ai/AIProviderRouter.js', dst: 'dist/src/services/ai/AIProviderRouter.js' },
  { src: 'src/services/ai/CharacterGenerator.js', dst: 'dist/src/services/ai/CharacterGenerator.js' },
  { src: 'src/services/story/ComplexityAnalyzer.js', dst: 'dist/src/services/story/ComplexityAnalyzer.js' },
  { src: 'src/components/AnnotationMargin.js', dst: 'dist/src/components/AnnotationMargin.js' },
  { src: 'src/components/Modals/CharacterSheetModal.js', dst: 'dist/src/components/Modals/CharacterSheetModal.js' },
  { src: 'src/components/Modals/LocationSheetModal.js', dst: 'dist/src/components/Modals/LocationSheetModal.js' },
  { src: 'src/components/Modals/ThreadSheetModal.js', dst: 'dist/src/components/Modals/ThreadSheetModal.js' },
  { src: 'src/components/Modals/ChapterSheetModal.js', dst: 'dist/src/components/Modals/ChapterSheetModal.js' },
  { src: 'src/components/Modals/ExportModal.js', dst: 'dist/src/components/Modals/ExportModal.js' },
  { src: 'src/components/ClaudeChat/ClaudeChat.js', dst: 'dist/src/components/ClaudeChat/ClaudeChat.js' },
  { src: 'src/services/ai/BatchProcessor.js', dst: 'dist/src/services/ai/BatchProcessor.js' },
  { src: 'src/services/ai/CostOptimizer.js', dst: 'dist/src/services/ai/CostOptimizer.js' },
  { src: 'src/services/ai/StoryContinuityTracker.js', dst: 'dist/src/services/ai/StoryContinuityTracker.js' },
  { src: 'src/services/ai/HybridWritingFlow.js', dst: 'dist/src/services/ai/HybridWritingFlow.js' },
  { src: 'src/services/ai/RefinementManager.js', dst: 'dist/src/services/ai/RefinementManager.js' },
  { src: 'src/services/story/PlotThreadTracker.js', dst: 'dist/src/services/story/PlotThreadTracker.js' },
  { src: 'src/services/validation/ConsistencyChecker.js', dst: 'dist/src/services/validation/ConsistencyChecker.js' }
];

// Font faces bundled from @fontsource (latin + latin-ext covers Finnish and Swedish)
const FONT_FACES = [
  { pkg: '@fontsource/eb-garamond', css: ['400.css', '400-italic.css', '500.css', '500-italic.css', '600.css', '600-italic.css'] },
  { pkg: '@fontsource/ibm-plex-mono', css: ['400.css', '500.css'] }
];
const FONT_SUBSETS = ['latin', 'latin-ext'];

// Builds dist/styles/fonts.css and copies the referenced woff2 files next to it
async function bundleFonts() {
  const outDir = path.join(__dirname, '..', 'dist', 'styles');
  await fs.ensureDir(path.join(outDir, 'fonts'));
  const faces = [];

  for (const { pkg, css } of FONT_FACES) {
    const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
    for (const file of css) {
      const source = await fs.readFile(path.join(pkgDir, file), 'utf-8');
      for (const block of source.match(/@font-face\s*{[^}]*}/g) || []) {
        const woff2 = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/);
        if (!woff2 || !FONT_SUBSETS.some(sub => woff2[1].includes(`-${sub}-`))) continue;
        await fs.copy(path.join(pkgDir, 'files', woff2[1]), path.join(outDir, 'fonts', woff2[1]));
        faces.push(block.replace(/src:[^;]+;/, `src: url(./fonts/${woff2[1]}) format('woff2');`));
      }
    }
  }

  if (faces.length === 0) throw new Error('No font faces found');
  await fs.writeFile(path.join(outDir, 'fonts.css'), faces.join('\n\n') + '\n');
  return faces.length;
}

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

  try {
    const count = await bundleFonts();
    copied.push(`${count} font faces`);
  } catch (error) {
    errors.push(`Error bundling fonts: ${error.message}`);
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
