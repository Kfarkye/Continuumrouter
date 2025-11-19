/**
 * HTML Combiner with Sandbox Security
 *
 * This module combines HTML, CSS, and JavaScript snippets into a complete,
 * sandboxed HTML document suitable for iframe rendering.
 *
 * Security: The generated document includes a console capture script that
 * safely communicates with the parent window via postMessage for debugging.
 */

interface HtmlComponents {
  html: string;
  css: string;
  js: string;
}

/**
 * Script injected into the iframe to capture console logs/errors and send them
 * back to the parent window using postMessage.
 *
 * This is crucial for debugging sandboxed iframes where the console is isolated.
 *
 * Security Note: This script runs in the sandboxed iframe context and can only
 * communicate via postMessage. The parent window validates the message type.
 */
const consoleCaptureScript = `
(function() {
  const parent = window.parent;

  function sendLog(level, args) {
    try {
      // Convert arguments to a string representation
      const message = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                // Handle Errors specifically
                if (arg instanceof Error) {
                    return arg.message + (arg.stack ? '\\n' + arg.stack : '');
                }
                // Attempt serialization, handling potential circular references
                const seen = new WeakSet();
                return JSON.stringify(arg, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) return '[Circular]';
                        if (value === window) return '[Window]';
                        if (value === document) return '[Document]';
                        seen.add(value);
                    }
                    return value;
                });
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
      }).join(' ');

      // Send message to the parent window
      parent.postMessage({
        type: 'iframe_console',
        payload: { level, message }
      }, '*'); // Target origin '*' is acceptable here as we are sending non-sensitive logs.
    } catch (e) {
      // Handle potential errors during message sending
      // Cannot log here as it would cause recursion
    }
  }

  // Override console methods
  const originalConsole = console;
  ['log', 'warn', 'error', 'info'].forEach(level => {
    const originalMethod = originalConsole[level];
    console[level] = function(...args) {
      sendLog(level, args);
      if (typeof originalMethod === 'function') {
        originalMethod.apply(originalConsole, args);
      }
    };
  });

  // Capture runtime errors
  window.addEventListener('error', function(event) {
    sendLog('error', ['Uncaught Error:', event.message, 'at line', event.lineno, 'col', event.colno]);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    sendLog('error', ['Unhandled Rejection:', String(event.reason)]);
  });

})();
`;

/**
 * Detects if JavaScript code uses ES module syntax
 * @param jsCode JavaScript code string
 * @returns true if the code uses import/export statements
 */
function isESModule(jsCode: string): boolean {
  const trimmedCode = jsCode.trim();
  return (
    /^\s*import\s+/m.test(trimmedCode) ||
    /^\s*export\s+/m.test(trimmedCode) ||
    /^\s*export\s+default\s+/m.test(trimmedCode)
  );
}

/**
 * Combines HTML, CSS, and JS snippets into a complete HTML document string (srcDoc).
 * Includes the console capture script for debugging support.
 *
 * @param components Object containing html, css, and js strings
 * @returns Complete HTML document as a string suitable for iframe srcDoc
 *
 * @example
 * ```typescript
 * const srcDoc = combineHtml({
 *   html: '<button id="btn">Click me</button>',
 *   css: '#btn { background: blue; color: white; }',
 *   js: 'document.getElementById("btn").onclick = () => alert("Hello!");'
 * });
 * ```
 */
export const combineHtml = ({ html, css, js }: HtmlComponents): string => {
  const sanitizedHtml = html || '';
  const cssContent = css.trim() ? `<style>${css}</style>` : '';

  let jsContent = '';
  if (js.trim()) {
    if (isESModule(js)) {
      jsContent = `<script type="module">
try {
${js}
} catch (e) {
  console.error("Module execution error:", e);
}
</script>`;
    } else {
      jsContent = `<script>
(function() {
  try {
    ${js}
  } catch (e) {
    console.error("Script execution error:", e);
  }
})();
</script>`;
    }
  }

  // Basic structure for the preview document
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Preview Sandbox</title>
  <style>
    /* Default styles for preview environment */
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 1rem;
      color: #333;
      background-color: #fff;
      line-height: 1.6;
    }
    * {
      box-sizing: border-box;
    }
  </style>
  ${cssContent}
</head>
<body>
  <script>${consoleCaptureScript}</script>
  ${sanitizedHtml}
  ${jsContent}
</body>
</html>
  `.trim();
};

/**
 * Calculates the size of the combined HTML document in bytes
 *
 * @param components Object containing html, css, and js strings
 * @returns Size in bytes
 */
export function calculatePreviewSize(components: HtmlComponents): number {
  const combined = combineHtml(components);
  // Use TextEncoder for accurate byte count (handles UTF-8 properly)
  return new TextEncoder().encode(combined).length;
}

/**
 * Validates that the combined preview is within acceptable size limits
 *
 * @param components Object containing html, css, and js strings
 * @param maxSizeBytes Maximum allowed size in bytes
 * @returns Object with validation result and size information
 */
export function validatePreviewComponents(
  components: HtmlComponents,
  maxSizeBytes: number
): {
  isValid: boolean;
  sizeInBytes: number;
  message: string;
} {
  const sizeInBytes = calculatePreviewSize(components);

  if (sizeInBytes > maxSizeBytes) {
    return {
      isValid: false,
      sizeInBytes,
      message: `Preview size (${Math.round(sizeInBytes / 1024)}KB) exceeds maximum allowed size (${Math.round(maxSizeBytes / 1024)}KB)`,
    };
  }

  return {
    isValid: true,
    sizeInBytes,
    message: '',
  };
}
