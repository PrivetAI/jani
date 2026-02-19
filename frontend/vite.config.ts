import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

const OLD_TARGETS = {
  chrome: 69 << 16,
  safari: 12 << 16,
  firefox: 62 << 16,
  ios_saf: 12 << 16,
  android: 69 << 16,
  samsung: 10 << 16,
};

/**
 * Post-process CSS for old browser compat (Chrome 69+).
 * 1) Run lightningcss with old targets (colors, nesting, vendor prefixes)
 * 2) Manual regex transforms for things lightningcss doesn't handle
 */
function postProcessCSS(): Plugin {
  return {
    name: 'post-process-css',
    enforce: 'post',
    async generateBundle(_, bundle) {
      const { transform, Features } = await import('lightningcss');
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && typeof file.source === 'string' && file.fileName.endsWith('.css')) {
          try {
            // Step 1: lightningcss for colors, nesting, selectors, vendor prefixes
            const result = transform({
              filename: file.fileName,
              code: Buffer.from(file.source),
              minify: false,
              targets: OLD_TARGETS,
              include:
                Features.Nesting |
                Features.Colors |
                Features.ColorFunction |
                Features.OklabColors |
                Features.LabColors |
                Features.P3Colors |
                Features.HexAlphaColors |
                Features.Selectors |
                Features.IsSelector |
                Features.NotSelectorList |
                Features.LangSelectorList |
                Features.MediaQueries |
                Features.MediaRangeSyntax |
                Features.DoublePositionGradients |
                Features.VendorPrefixes |
                Features.SpaceSeparatedColorNotation |
                Features.ClampFunction |
                Features.LogicalProperties,
              errorRecovery: true,
            });
            let css = result.code.toString();

            // Step 2: Manual transforms for remaining modern CSS
            css = manualDowngrade(css);

            file.source = css;
          } catch (e) {
            console.warn(`[post-process-css] Error:`, e);
          }
        }
      }
    },
  };
}

function manualDowngrade(css: string): string {
  // Strip @layer wrappers
  css = css.replace(/@layer\s+[\w,\s]+;/g, '');
  css = unwrapLayers(css);

  // Strip @property blocks (Chrome 85+, fallbacks exist via @supports)
  css = css.replace(/@property\s+--[\w-]+\s*\{[^}]*\}/g, '');

  // padding-inline → padding-left + padding-right
  css = css.replace(/padding-inline\s*:\s*([^;}]+)/g, 'padding-left:$1;padding-right:$1');
  // padding-block → padding-top + padding-bottom
  css = css.replace(/padding-block\s*:\s*([^;}]+)/g, 'padding-top:$1;padding-bottom:$1');
  // margin-inline → margin-left + margin-right
  css = css.replace(/margin-inline\s*:\s*([^;}]+)/g, 'margin-left:$1;margin-right:$1');
  // margin-block → margin-top + margin-bottom
  css = css.replace(/margin-block\s*:\s*([^;}]+)/g, 'margin-top:$1;margin-bottom:$1');

  // inset: X → top:X;right:X;bottom:X;left:X (but NOT inside custom props like --tw-ring-inset)
  css = css.replace(/(?<![-\w])inset\s*:\s*([^;}]+)/g, (_, val) => {
    const v = val.trim();
    return `top:${v};right:${v};bottom:${v};left:${v}`;
  });

  // border-inline-start → border-left, border-inline-end → border-right
  css = css.replace(/border-inline-start/g, 'border-left');
  css = css.replace(/border-inline-end/g, 'border-right');

  // individual transform: translate: X Y → transform: translate(X, Y)
  // scale: X → transform: scale(X)
  css = css.replace(/(?<![a-zA-Z-])translate\s*:\s*([^;}]+)/g, (_, val) => {
    const parts = val.trim().split(/\s+/);
    if (parts.length === 2) return `transform:translate(${parts[0]},${parts[1]})`;
    return `transform:translate(${parts[0]})`;
  });
  css = css.replace(/(?<![a-zA-Z-])scale\s*:\s*([^;}]+)/g, (_, val) => {
    const parts = val.trim().split(/\s+/);
    if (parts.length >= 2) return `transform:scale(${parts[0]},${parts[1]})`;
    return `transform:scale(${parts[0]})`;
  });

  // aspect-ratio: keep as-is, Chrome 88+ supports it, older just ignore (acceptable degradation)

  // :where() → remove specificity wrapper (just use plain selectors)
  // This is tricky, keep :where for now as it's just specificity reduction

  return css;
}

function unwrapLayers(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const layerMatch = css.slice(i).match(/^@layer\s+[\w-]+\s*\{/);
    if (layerMatch) {
      i += layerMatch[0].length;
      let depth = 1;
      const start = i;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        if (depth > 0) i++;
      }
      out += css.slice(start, i);
      i++;
    } else {
      out += css[i];
      i++;
    }
  }
  return out;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), postProcessCSS()],
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
