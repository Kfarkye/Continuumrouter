/**
 * Configuration constants for HTML/CSS/JS live preview functionality
 *
 * These limits ensure stability and prevent resource exhaustion while
 * providing a seamless development experience.
 */

export const PREVIEW_CONFIG = {
  /**
   * Maximum number of preview iframes to render per message
   * Prevents browser resource exhaustion from too many concurrent iframes
   */
  MAX_PREVIEWS_PER_MESSAGE: 3,

  /**
   * Maximum combined size of HTML, CSS, and JS for a single preview (in bytes)
   * 500KB allows for complex examples while preventing browser bottlenecks
   */
  MAX_PREVIEW_SIZE_BYTES: 512000, // 500KB

  /**
   * Warning threshold for preview size (in bytes)
   * User will see a warning banner when preview size exceeds this but is under max
   */
  PREVIEW_WARNING_THRESHOLD: 409600, // 400KB

  /**
   * Console capture configuration
   */
  CONSOLE: {
    /**
     * Maximum number of console messages to retain
     */
    MAX_MESSAGES: 500,

    /**
     * Automatically open console when errors occur
     */
    AUTO_OPEN_ON_ERROR: true,
  },

  /**
   * Sandbox security settings
   * These iframe sandbox attributes ensure strict isolation
   * CRITICAL: Never add 'allow-same-origin' - it breaks sandbox security
   */
  SANDBOX_ATTRIBUTES: 'allow-scripts allow-modals allow-popups',

  /**
   * Performance optimization settings
   */
  PERFORMANCE: {
    /**
     * Debounce delay for rapid preview updates (milliseconds)
     */
    UPDATE_DEBOUNCE_MS: 300,

    /**
     * Maximum time to wait for preview rendering before timeout (milliseconds)
     */
    RENDER_TIMEOUT_MS: 5000,
  },
} as const;

/**
 * Type-safe access to configuration values
 */
export type PreviewConfig = typeof PREVIEW_CONFIG;

/**
 * Helper function to format bytes to human-readable size
 */
export function formatPreviewSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Helper function to check if preview size is within limits
 */
export function validatePreviewSize(sizeInBytes: number): {
  isValid: boolean;
  shouldWarn: boolean;
  message: string;
} {
  if (sizeInBytes > PREVIEW_CONFIG.MAX_PREVIEW_SIZE_BYTES) {
    return {
      isValid: false,
      shouldWarn: false,
      message: `Preview too large (${formatPreviewSize(sizeInBytes)}). Maximum size is ${formatPreviewSize(PREVIEW_CONFIG.MAX_PREVIEW_SIZE_BYTES)}.`,
    };
  }

  if (sizeInBytes > PREVIEW_CONFIG.PREVIEW_WARNING_THRESHOLD) {
    return {
      isValid: true,
      shouldWarn: true,
      message: `Large preview (${formatPreviewSize(sizeInBytes)}). May impact performance.`,
    };
  }

  return {
    isValid: true,
    shouldWarn: false,
    message: '',
  };
}
