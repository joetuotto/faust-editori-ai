/**
 * WCAG Contrast Guard
 * Ensures all text meets WCAG AA standard (4.5:1 contrast ratio)
 * Feature: PR1 - Teemat & Typografia
 */

/**
 * Calculate relative luminance of a color
 * @param {string} hex - Hex color code (e.g., "#FF0000")
 * @returns {number} Relative luminance (0-1)
 */
function relativeLuminance(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  
  const [rs, gs, bs] = [r, g, b].map(val => 
    val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  );
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * @param {string} bg - Background color hex
 * @param {string} fg - Foreground color hex
 * @returns {number} Contrast ratio (1-21)
 */
export function contrastRatio(bg, fg) {
  const L1 = relativeLuminance(bg);
  const L2 = relativeLuminance(fg);
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ensure a color meets minimum contrast ratio against background
 * @param {string} bgHex - Background color
 * @param {string} textHex - Text color
 * @param {number} targetRatio - Target contrast ratio (default: 4.5 for WCAG AA)
 * @returns {string} Adjusted text color that meets contrast requirement
 */
export function ensureContrast(bgHex, textHex, targetRatio = 4.5) {
  let ratio = contrastRatio(bgHex, textHex);
  
  // Already meets requirement
  if (ratio >= targetRatio) {
    return textHex;
  }
  
  // Parse initial color
  const hex = textHex.replace('#', '');
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);
  
  // Determine if we need to darken or lighten
  const bgLum = relativeLuminance(bgHex);
  const shouldDarken = bgLum > 0.5;
  
  // Iteratively adjust until we meet the target ratio
  const step = shouldDarken ? -4 : 4;
  const limit = shouldDarken ? 0 : 255;
  
  for (let i = 0; i < 64 && ratio < targetRatio; i++) {
    if (shouldDarken) {
      r = Math.max(0, r + step);
      g = Math.max(0, g + step);
      b = Math.max(0, b + step);
    } else {
      r = Math.min(255, r + step);
      g = Math.min(255, g + step);
      b = Math.min(255, b + step);
    }
    
    const adjustedHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    ratio = contrastRatio(bgHex, adjustedHex);
    
    if (ratio >= targetRatio) {
      return adjustedHex;
    }
    
    // Prevent infinite loop if we hit limits
    if ((shouldDarken && r === 0 && g === 0 && b === 0) ||
        (!shouldDarken && r === 255 && g === 255 && b === 255)) {
      break;
    }
  }
  
  // Return original if we couldn't fix it
  return textHex;
}

/**
 * Apply contrast guard to paper elements
 * Should be called when theme changes or on mount
 */
export function applyContrastGuard() {
  // Get current theme colors
  const computedStyle = getComputedStyle(document.documentElement);
  const paper = computedStyle.getPropertyValue('--paper').trim();
  const ink = computedStyle.getPropertyValue('--ink').trim();
  
  if (!paper || !ink) {
    console.warn('[Contrast Guard] Could not read theme colors');
    return;
  }
  
  // Ensure ink meets contrast requirement on paper
  const adjustedInk = ensureContrast(paper, ink, 4.5);
  
  if (adjustedInk !== ink) {
    console.log(`[Contrast Guard] Adjusted ink color for better contrast: ${ink} → ${adjustedInk}`);
    document.documentElement.style.setProperty('--ink', adjustedInk);
  }
  
  // Log current ratio for debugging
  const ratio = contrastRatio(paper, adjustedInk);
  console.log(`[Contrast Guard] Paper/Ink ratio: ${ratio.toFixed(2)}:1 (target: 4.5:1)`);
}

// Auto-apply on import if window is available
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyContrastGuard);
  } else {
    applyContrastGuard();
  }
}

