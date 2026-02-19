import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

/**
 * Strip CSS @layer wrappers for old browser compat (Chrome < 99).
 * Unwraps `@layer name { ... }` into plain CSS, preserving content.
 */
function stripCssLayers(): Plugin {
  return {
    name: 'strip-css-layers',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && typeof file.source === 'string' && file.fileName.endsWith('.css')) {
          file.source = unwrapLayers(file.source);
        }
      }
    },
  };
}

function unwrapLayers(css: string): string {
  // Remove @layer declarations like `@layer properties, theme, base, components, utilities;`
  css = css.replace(/@layer\s+[\w,\s]+;/g, '');
  // Unwrap @layer blocks: `@layer name { content }` → `content`
  let result = css;
  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(/@layer\s+[\w-]+\s*\{([\s\S]*?)\}(?=\s*(?:@layer|@media|@supports|@keyframes|@property|\/\*|\.|#|:|\[|[a-zA-Z*]|$))/g, '$1');
  }
  // Fallback: more aggressive unwrap for nested cases
  if (result.includes('@layer')) {
    result = manualUnwrap(result);
  }
  return result;
}

function manualUnwrap(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const layerMatch = css.slice(i).match(/^@layer\s+[\w-]+\s*\{/);
    if (layerMatch) {
      i += layerMatch[0].length;
      // Find matching closing brace
      let depth = 1;
      const start = i;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        if (depth > 0) i++;
      }
      out += css.slice(start, i);
      i++; // skip closing }
    } else {
      out += css[i];
      i++;
    }
  }
  return out;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripCssLayers()],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 69 << 16,
        safari: 12 << 16,
        firefox: 62 << 16,
        ios_saf: 12 << 16,
        android: 69 << 16,
        samsung: 10 << 16,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_DEV_SERVER_PORT ?? 4173),
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/telegram': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
