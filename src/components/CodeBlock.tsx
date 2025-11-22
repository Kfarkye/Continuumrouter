// FILE: src/components/CodeBlock.tsx
// DESC: A production-grade, high-performance, and accessible code block component for React.
//       Engineered for Linear/Vercel quality standards with virtualization, advanced streaming support,
//       and a minimalist aesthetic inspired by Jony Ive.

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  forwardRef,
  Component,
  memo,
  CSSProperties,
} from 'react';

// Virtualization Libraries (Dependencies: react-window, react-virtualized-auto-sizer)
import { FixedSizeList, ListChildComponentProps as RWListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

// Syntax Highlighting (Dependency: react-syntax-highlighter)
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus as defaultThemeStyle } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { PrismStyle } from 'react-syntax-highlighter/dist/esm/types';

// Language definitions (Statically imported, assuming tree-shaking)
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';

// Icons (Dependency: lucide-react)
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  WrapText,
  Code as FileCodeIcon,
  AlertTriangle,
  Loader2,
  Terminal,
} from 'lucide-react';

/* ============================================================================
    UTILITIES (Integrated for single-file deliverable)
   ============================================================================ */

// Minimal implementation of cn utility (clsx/tailwind-merge)
type ClassValue = string | number | boolean | null | undefined | ClassValue[];
const cn = (...inputs: ClassValue[]): string => {
  return inputs.flat(Infinity).filter(Boolean).join(' ');
};

// Utility to map language identifiers to file extensions
const getFileExtension = (language: string): string => {
  const map: Record<string, string> = {
    javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
    python: 'py', py: 'py', css: 'css', html: 'html', markup: 'html',
    bash: 'sh', shell: 'sh', json: 'json', yaml: 'yaml', yml: 'yml', sql: 'sql',
    markdown: 'md', md: 'md', diff: 'diff', text: 'txt',
  };
  return map[language?.toLowerCase()] || 'txt';
};

/* ============================================================================
    LANGUAGE REGISTRATION
   ============================================================================ */

const REGISTERED_LANGUAGES = new Set<string>();

const register = (aliases: string[], language: any) => {
  aliases.forEach(alias => {
    if (!REGISTERED_LANGUAGES.has(alias)) {
      try {
        SyntaxHighlighter.registerLanguage(alias, language);
        REGISTERED_LANGUAGES.add(alias);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[CodeBlock] Failed to register language alias: ${alias}`, error);
        }
      }
    }
  });
};

// Register common languages
register(['javascript', 'js'], javascript);
register(['typescript', 'ts'], typescript);
register(['jsx'], jsx);
register(['tsx'], tsx);
register(['python', 'py'], python);
register(['css'], css);
register(['html', 'xml', 'svg', 'markup'], markup);
register(['bash', 'shell', 'sh'], bash);
register(['json'], json);
register(['yaml', 'yml'], yaml);
register(['sql'], sql);
register(['markdown', 'md'], markdown);
register(['diff'], diff);
REGISTERED_LANGUAGES.add('text');

/* ============================================================================
    CONFIGURATION
   ============================================================================ */

const CONFIG = {
  COPY_CONFIRMATION_DURATION: 2000, // ms
  DEFAULT_COLLAPSED_HEIGHT: 320, // px
  // CRITICAL: Must match CSS (14px font-size * 1.6 line-height). FixedSizeList requires precision.
  LINE_HEIGHT: 22.4,
  SMART_INLINE_MAX_LENGTH: 100,
  MINIMALIST_VIEW_MAX_LINES: 4,
  VIRTUALIZATION_THRESHOLD: 100, // Enable virtualization earlier
  VIRTUALIZATION_PROCESSING_TIMEOUT: 3000, // ms
  VERTICAL_PADDING: 32, // 16px top + 16px bottom
  MAX_VIEWPORT_HEIGHT_RATIO: 0.75,
  HIGHLIGHT_COLOR: 'rgba(59, 130, 246, 0.1)', // Subtle blue highlight
  HIGHLIGHT_BORDER_COLOR: '#3b82f6', // Blue border
};

const ICON_SIZE = {
  TOOLBAR: 16,
  MINIMAL: 16,
  HEADER: 16,
};

/* ============================================================================
    TYPE DEFINITIONS
   ============================================================================ */

export interface CodeBlockProps {
  language?: string;
  value?: string;
  children?: React.ReactNode;
  filename?: string;
  wrap?: boolean;
  showLineNumbers?: boolean;
  highlightLines?: string | number[];
  collapsible?: boolean;
  collapsedHeight?: number;
  height?: number | string;
  theme?: PrismStyle;
  className?: string;
  onCopy?: (text: string) => void;
  inline?: boolean;
  isStreaming?: boolean;
}

interface ActionProps {
  icon: React.ElementType;
  label: string;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: (event?: React.MouseEvent) => void;
  href?: string;
  download?: string;
  className?: string;
  variant?: 'standard' | 'minimal';
}

interface CodeHeaderProps {
  label: string;
  Icon: React.ElementType;
  isWrapped: boolean;
  toggleWrap: () => void;
  isCollapsible: boolean;
  isExpanded: boolean;
  toggleExpanded: (focusOnExpand?: boolean) => void;
  downloadUrl: string | undefined;
  downloadName: string;
  copied: boolean;
  doCopy: () => void;
  isStreaming?: boolean;
}

interface HoverToolbarProps {
  isWrapped: boolean;
  toggleWrap: () => void;
  downloadUrl: string | undefined;
  downloadName: string;
  copied: boolean;
  doCopy: () => void;
}

interface NonVirtualizedRendererProps {
  containerRef: React.RefObject<HTMLDivElement>;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  detectedLanguage: string;
  theme: PrismStyle;
  highlighterBaseStyle: CSSProperties;
  showLineNumbers: boolean;
  lineNumberStyle: CSSProperties;
  isWrapped: boolean;
  linePropsRenderer: (lineNumber: number) => { style: CSSProperties };
  code: string;
  tabIndex?: number;
}

// Types for react-window virtualization
type ItemData = React.ReactElement[];
type ListChildComponentProps = RWListChildComponentProps<ItemData>;

// Type for the react-syntax-highlighter renderer prop
interface RendererProps {
  rows: React.ReactNode[];
  stylesheet: PrismStyle;
  useInlineStyles: boolean;
}

/* ============================================================================
    UTILITY FUNCTIONS (Internal Helpers)
   ============================================================================ */

/**
 * Extracts text content from React children recursively.
 */
const extractText = (children: React.ReactNode): string => {
  if (!children) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (typeof children === 'boolean' || children == null) return '';
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (React.isValidElement(children) && children.props && children.props.children) {
    return extractText(children.props.children);
  }
  return '';
};

/**
 * Parses highlight specification string into a Set for O(1) lookups.
 */
function parseHighlightSpec(spec?: string | number[]): Set<number> {
  const highlights = new Set<number>();
  if (!spec) return highlights;

  if (Array.isArray(spec)) {
    spec.forEach(n => {
      if (typeof n === 'number' && n > 0) highlights.add(n);
    });
    return highlights;
  }

  const tokens = String(spec)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startStr, endStr] = token.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);

      if (Number.isFinite(start) && Number.isFinite(end) && start > 0) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          highlights.add(i);
        }
      }
    } else {
      const n = parseInt(token, 10);
      if (Number.isFinite(n) && n > 0) highlights.add(n);
    }
  }
  return highlights;
}

/**
 * Writes text to the clipboard using the Clipboard API with robust fallbacks.
 */
async function writeClipboard(text: string): Promise<boolean> {
  // 1. Modern Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[CodeBlock] Clipboard API failed, falling back.');
      }
    }
  }

  // 2. Legacy execCommand fallback
  if (typeof document !== 'undefined' && document.execCommand) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      // Position off-screen and make invisible
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[CodeBlock] execCommand copy failed.');
      }
      return false;
    }
  }
  return false;
}

/* ============================================================================
    VIRTUALIZED COMPONENTS
   ============================================================================ */

/**
 * Inner container for FixedSizeList. Applies vertical padding correctly.
 */
const VirtualizedInnerContainer = memo(
  forwardRef<HTMLDivElement, React.HTMLProps<HTMLDivElement>>(({ style, ...rest }, ref) => (
    <div
      ref={ref}
      style={{
        ...style,
        // Ensure padding is applied within the scrollable area
        paddingTop: `${CONFIG.VERTICAL_PADDING / 2}px`,
        paddingBottom: `${CONFIG.VERTICAL_PADDING / 2}px`,
        boxSizing: 'border-box',
        // Adjust the height calculation to include the padding
        height: style?.height ? parseFloat(style.height as string) + CONFIG.VERTICAL_PADDING : style?.height,
      }}
      {...rest}
    />
  ))
);
VirtualizedInnerContainer.displayName = 'VirtualizedInnerContainer';

/**
 * Renders individual rows within the virtualized list. Optimized and robust.
 */
const VirtualizedRow = memo(({ index, style, data }: ListChildComponentProps) => {
  if (!Array.isArray(data) || index >= data.length) return null;

  const row = data[index];

  // Handle rare rendering failures gracefully
  if (!row || !React.isValidElement(row) || !row.props) {
    return (
      <div
        style={{
          ...style,
          color: '#f87171', // text-red-400
          backgroundColor: 'rgba(248, 113, 113, 0.05)',
          paddingLeft: '1rem',
          fontStyle: 'italic',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label={`Error rendering line ${index + 1}`}
      >
        <AlertTriangle size={14} className="mr-2" />
        (Line rendering failed)
      </div>
    );
  }

  // Merge virtualization positioning styles with the row's intrinsic styles.
  const mergedStyle = {
    ...(row.props.style || {}),
    ...style,
  };

  return React.cloneElement(row, { style: mergedStyle });
});
VirtualizedRow.displayName = 'VirtualizedRow';

/* ============================================================================
    ERROR BOUNDARY
   ============================================================================ */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackRenderer: () => React.ReactNode;
  context: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary for virtualization failures. Falls back to standard rendering on error.
 */
class CodeBlockErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to monitoring service in production
    console.error(
      `[CodeBlock ErrorBoundary] Error caught in context: ${this.props.context}. Falling back.`,
      error,
      errorInfo
    );
  }

  render() {
    // Environment check
    if (this.props.context === 'Virtualization' && (typeof FixedSizeList === 'undefined' || !FixedSizeList)) {
         return <div className="h-full overflow-hidden">{this.props.fallbackRenderer()}</div>;
    }

    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col">
          {this.props.context === 'Virtualization' && (
              <div
                className="px-4 py-1 bg-yellow-900/30 border-b border-yellow-700/30 text-xs text-yellow-500 flex items-center gap-2"
                role="alert"
              >
                <AlertTriangle size={12} />
                Performance optimization (virtualization) disabled due to a runtime error.
              </div>
          )}
          <div className="flex-1 overflow-hidden">{this.props.fallbackRenderer()}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================================================================
    UI SUB-COMPONENTS
   ============================================================================ */

/**
 * Screen reader announcer (A11y).
 */
const LiveAnnouncer: React.FC<{ message: string }> = memo(({ message }) => (
  <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
    {message}
  </div>
));
LiveAnnouncer.displayName = 'LiveAnnouncer';

/**
 * Reusable, accessible toolbar action component.
 */
const ToolbarAction = forwardRef<HTMLElement, ActionProps>(
  (
    {
      icon: Icon,
      label,
      tooltip,
      active,
      disabled,
      onClick,
      href,
      download,
      className = '',
      variant = 'standard',
    },
    ref
  ) => {
    const isMinimal = variant === 'minimal';

    // Styling: Minimalist, precise interactions, clear focus states.
    const baseClasses = cn(
      'inline-flex items-center transition-all duration-150 ease-in-out',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      // Sizing and spacing
      isMinimal
        ? 'p-2 rounded-md'
        : 'gap-2 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950',

      // State styling
      disabled
        ? 'text-gray-600 cursor-not-allowed opacity-50'
        : cn(
            'text-gray-400 hover:text-white',
            // Subtle "material" background on hover/active
            isMinimal ? 'hover:bg-white/10' : 'hover:bg-zinc-800/70',
            active && (isMinimal ? 'text-white bg-white/15' : 'bg-zinc-800 text-white')
          )
    );

    const iconSize = isMinimal ? ICON_SIZE.MINIMAL : ICON_SIZE.TOOLBAR;

    const content = (
      <>
        <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />
        {!isMinimal && <span className="hidden sm:inline">{label}</span>}
      </>
    );

    const handleClick = (e: React.MouseEvent) => {
        if (disabled) {
            e.preventDefault();
            return;
        }
        onClick?.(e);
    };

    // Render as <a> tag if href is provided (for download links)
    if (href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={disabled ? undefined : href}
          download={download}
          className={cn(baseClasses, className)}
          aria-label={tooltip}
          title={tooltip}
          aria-disabled={disabled}
          onClick={handleClick}
        >
          {content}
        </a>
      );
    }

    // Render as <button> tag
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(baseClasses, className)}
        aria-label={tooltip}
        title={tooltip}
        aria-pressed={active !== undefined ? active : undefined}
      >
        {content}
      </button>
    );
  }
);
ToolbarAction.displayName = 'ToolbarAction';

/**
 * Header component with file info and primary actions.
 */
const CodeHeader: React.FC<CodeHeaderProps> = memo(
  ({
    label,
    Icon,
    isWrapped,
    toggleWrap,
    isCollapsible,
    isExpanded,
    toggleExpanded,
    downloadUrl,
    downloadName,
    copied,
    doCopy,
    isStreaming,
  }) => {
    return (
      // Sticky positioning with a subtle "glass" effect (backdrop-blur).
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900/90 border-b border-white/10 backdrop-blur-sm sticky top-0 z-20 shadow-md">
        {/* File Info */}
        <div className="flex items-center gap-3 min-w-0">
          <Icon size={ICON_SIZE.HEADER} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 truncate block" title={label}>
            {label}
          </span>
          {isStreaming && (
             <div className="text-xs text-blue-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Streaming...
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1">
          <ToolbarAction
            icon={WrapText}
            onClick={toggleWrap}
            label={isWrapped ? 'Unwrap' : 'Wrap'}
            tooltip="Toggle line wrap (Alt+Z). Note: Wrapping large files may affect performance."
            active={isWrapped}
          />

          {isCollapsible && (
            <ToolbarAction
              icon={isExpanded ? Minimize2 : Maximize2}
              onClick={() => toggleExpanded(false)}
              label={isExpanded ? 'Collapse' : 'Expand'}
              tooltip={
                isExpanded ? 'Collapse code block (Ctrl/⌘ + .)' : 'Expand code block (Ctrl/⌘ + .)'
              }
            />
          )}

          <ToolbarAction
            icon={Download}
            href={downloadUrl ?? undefined}
            download={downloadName}
            label="Download"
            tooltip="Download code snippet"
            disabled={!downloadUrl}
          />

          <ToolbarAction
            icon={copied ? Check : Copy}
            onClick={doCopy}
            label={copied ? 'Copied' : 'Copy'}
            tooltip="Copy code (Ctrl/⌘+Shift+C)"
            // Distinct visual confirmation for successful copy
            className={copied ? '!text-green-400 hover:!text-green-400 !bg-green-500/20' : ''}
          />
        </div>
      </div>
    );
  }
);
CodeHeader.displayName = 'CodeHeader';

/**
 * Floating toolbar for the minimalist view.
 */
const HoverToolbar: React.FC<HoverToolbarProps> = memo(
  ({ isWrapped, toggleWrap, downloadUrl, downloadName, copied, doCopy }) => {
    return (
      // Fades in on hover/focus.
      <div className="absolute top-3 right-3 z-20 transition-opacity duration-300 ease-in-out opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-auto">
        {/* Toolbar "Pill" container with glass effect */}
        <div className="flex items-center gap-0.5 bg-zinc-800/80 backdrop-blur-lg rounded-lg p-0.5 shadow-xl border border-white/10">
          <ToolbarAction
            variant="minimal"
            icon={WrapText}
            onClick={toggleWrap}
            label=""
            tooltip="Toggle line wrap (Alt+Z)"
            active={isWrapped}
          />

          <ToolbarAction
            variant="minimal"
            icon={Download}
            href={downloadUrl ?? undefined}
            download={downloadName}
            label=""
            tooltip="Download code snippet"
            disabled={!downloadUrl}
          />

          <ToolbarAction
            variant="minimal"
            icon={copied ? Check : Copy}
            onClick={doCopy}
            label=""
            tooltip="Copy code (Ctrl/⌘+Shift+C)"
            className={copied ? '!text-green-400 hover:!text-green-400 !bg-green-500/20' : ''}
          />
        </div>
      </div>
    );
  }
);
HoverToolbar.displayName = 'HoverToolbar';

/* ============================================================================
    RENDERERS
   ============================================================================ */

/**
 * Standard, non-virtualized renderer. Used for shorter code, streaming, or fallback.
 */
const NonVirtualizedRenderer: React.FC<NonVirtualizedRendererProps> = memo(
  ({
    containerRef,
    onScroll,
    detectedLanguage,
    theme,
    highlighterBaseStyle,
    showLineNumbers,
    lineNumberStyle,
    isWrapped,
    linePropsRenderer,
    code,
    tabIndex = 0,
  }) => (
    <div
      ref={containerRef}
      // 'code-scrollbar' class assumes global CSS for stylized (thin, dark) scrollbars.
      className='overflow-auto code-scrollbar h-full transition-opacity duration-200 ease-in-out focus:outline-none'
      onScroll={onScroll}
      tabIndex={tabIndex}
      role="code"
      aria-label="Code content"
      // Apply vertical padding consistent with the virtualized view.
      style={{ padding: `${CONFIG.VERTICAL_PADDING / 2}px 0` }}
    >
      <SyntaxHighlighter
        language={detectedLanguage}
        style={theme}
        customStyle={highlighterBaseStyle}
        codeTagProps={{ style: { fontFamily: highlighterBaseStyle.fontFamily } }}
        showLineNumbers={showLineNumbers}
        lineNumberStyle={lineNumberStyle}
        // wrapLines=true is required to enable linePropsRenderer.
        wrapLines={true}
        wrapLongLines={isWrapped}
        lineProps={linePropsRenderer}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
);
NonVirtualizedRenderer.displayName = 'NonVirtualizedRenderer';

/* ============================================================================
    MAIN COMPONENT
   ============================================================================ */

export const CodeBlock: React.FC<CodeBlockProps> = (props) => {
  const {
    language,
    value,
    children,
    filename,
    wrap = false,
    showLineNumbers = true,
    highlightLines,
    collapsible,
    collapsedHeight = CONFIG.DEFAULT_COLLAPSED_HEIGHT,
    height: heightOverride,
    theme = defaultThemeStyle,
    className = '',
    onCopy,
    inline,
    isStreaming = false,
  } = props;

  /* --------------------------------------------------------------------------
     REFS
     -------------------------------------------------------------------------- */
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightedRowsRef = useRef<ItemData>([]);
  const needsProcessingRef = useRef<boolean>(true);
  const listRef = useRef<FixedSizeList>(null);
  const virtualizedOuterRef = useRef<HTMLDivElement>(null);
  const nonVirtualizedContainerRef = useRef<HTMLDivElement>(null);

  // Scroll management refs
  const lastScrollTop = useRef<number>(0);
  const isUserNearBottom = useRef<boolean>(true); // Track user scroll intent for streaming

  // Timer refs
  const copiedTimer = useRef<number | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);

  /* --------------------------------------------------------------------------
     CONTENT EXTRACTION & NORMALIZATION
     -------------------------------------------------------------------------- */
  const rawInput = value ?? extractText(children);
  const safeInput = typeof rawInput === 'string' ? rawInput : String(rawInput || '');
  // Normalize line endings (CRLF to LF) and trim whitespace.
  const code = useMemo(() => safeInput.replace(/\r\n/g, '\n').trim(), [safeInput]);

  /* --------------------------------------------------------------------------
     RENDERING MODE DETECTION
     -------------------------------------------------------------------------- */
  const renderMode = useMemo((): 'inline' | 'block' => {
    if (inline) return 'inline';
    // Smart detection for short, single-line snippets.
    if (
      !code.includes('\n') &&
      code.length > 0 &&
      code.length < CONFIG.SMART_INLINE_MAX_LENGTH
    ) {
      return 'inline';
    }
    return 'block';
  }, [inline, code]);

  /* --------------------------------------------------------------------------
     LANGUAGE DETECTION
     -------------------------------------------------------------------------- */
  const detectedLanguage = useMemo(() => {
    const lang = (language || (/language-(\w+)/.exec(className || '')?.[1]))?.toLowerCase();
    if (lang && REGISTERED_LANGUAGES.has(lang)) {
      return lang;
    }
    return 'text';
  }, [language, className]);

  // Determine the icon based on language
  const HeaderIcon = useMemo(() => {
      if (detectedLanguage === 'bash' || detectedLanguage === 'shell' || detectedLanguage === 'sh') {
          return Terminal;
      }
      return FileCodeIcon;
  }, [detectedLanguage]);

  /* --------------------------------------------------------------------------
     DATA PREPARATION
     -------------------------------------------------------------------------- */
  const lines = useMemo(() => (code === '' ? [] : code.split('\n')), [code]);
  const highlights = useMemo(() => parseHighlightSpec(highlightLines), [highlightLines]);
  const isMinimalistView = lines.length <= CONFIG.MINIMALIST_VIEW_MAX_LINES && lines.length > 0 && !filename && !heightOverride;

  /* --------------------------------------------------------------------------
     STATE
     -------------------------------------------------------------------------- */
  const [isWrapped, setIsWrapped] = useState<boolean>(wrap);
  const [copied, setCopied] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [renderCounter, setRenderCounter] = useState<number>(0);
  const [expanded, setExpanded] = useState<boolean>(true);
  const [virtualizationDisabled, setVirtualizationDisabled] = useState<boolean>(false);

  /* --------------------------------------------------------------------------
     VIRTUALIZATION LOGIC
     -------------------------------------------------------------------------- */

  const useVirtualization = useMemo(() => {
    if (typeof FixedSizeList === 'undefined' || virtualizationDisabled) return false;
    // Disable during streaming as content changes rapidly.
    if (isStreaming) return false;
    // Virtualization requires fixed height (no wrapping) and sufficient lines.
    return !isWrapped && lines.length > CONFIG.VIRTUALIZATION_THRESHOLD;
  }, [isStreaming, isWrapped, virtualizationDisabled, lines.length]);

  // Effect: Reset virtualization state when inputs change.
  useEffect(() => {
    highlightedRowsRef.current = [];
    needsProcessingRef.current = true;
    setVirtualizationDisabled(false);
    setRenderCounter((prev) => prev + 1);

    return () => {
      if (processingTimeoutRef.current) {
        window.clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, [code, detectedLanguage, showLineNumbers, highlightLines, theme]);

  // Effect: Manage the virtualization processing timeout.
  useEffect(() => {
    if (!useVirtualization || !needsProcessingRef.current) {
       if (processingTimeoutRef.current) {
            window.clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
        }
      return;
    }

    if (processingTimeoutRef.current) {
      window.clearTimeout(processingTimeoutRef.current);
    }

    // Set timeout fallback.
    processingTimeoutRef.current = window.setTimeout(() => {
      if (needsProcessingRef.current) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[CodeBlock] Virtualization processing timed out. Falling back to standard rendering.`);
        }
        needsProcessingRef.current = false;
        setVirtualizationDisabled(true);
        setRenderCounter((prev) => prev + 1);
      }
      processingTimeoutRef.current = null;
    }, CONFIG.VIRTUALIZATION_PROCESSING_TIMEOUT);

    return () => {
      if (processingTimeoutRef.current) {
        window.clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, [useVirtualization, renderCounter]);

  const safeItemData = useMemo(() => highlightedRowsRef.current || [], [renderCounter]);

  /* --------------------------------------------------------------------------
     SCROLL & STREAMING MANAGEMENT
     -------------------------------------------------------------------------- */

  // Unified scroll state update logic
  const updateScrollState = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    lastScrollTop.current = scrollTop;
    // Threshold of 1.5 lines to determine if user is "near bottom"
    const threshold = CONFIG.LINE_HEIGHT * 1.5;
    isUserNearBottom.current = scrollHeight - scrollTop <= clientHeight + threshold;
  }, []);

  const handleListScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    lastScrollTop.current = scrollOffset;
    // Tracking near bottom in virtualized lists during streaming is usually not needed as virtualization is disabled.
  }, []);

  const handleNonVirtualizedScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    updateScrollState(event.currentTarget);
  }, [updateScrollState]);

  // Effect: Restore scroll position when switching modes (e.g., toggling wrap).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!useVirtualization && nonVirtualizedContainerRef.current) {
        nonVirtualizedContainerRef.current.scrollTop = lastScrollTop.current;
        updateScrollState(nonVirtualizedContainerRef.current);
      }
       // Virtualized list restores scroll via initialScrollOffset prop.
    }, 0);
    return () => clearTimeout(timer);
  }, [useVirtualization, updateScrollState]);

  // Effect: Intelligent auto-scroll for streaming content
  useEffect(() => {
    if (!isStreaming || useVirtualization) return;

    // Only auto-scroll if the user is already near the bottom
    if (isUserNearBottom.current) {
      const container = nonVirtualizedContainerRef.current;
      if (container) {
        try {
          // Use 'smooth' behavior for a polished experience, 'auto' if distance is large
          const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
          const behavior = distance > container.clientHeight * 2 ? 'auto' : 'smooth';

          container.scrollTo({ top: container.scrollHeight, behavior });
        } catch (e) {
          // Fallback for browsers not supporting scrollTo options
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  }, [code, isStreaming, useVirtualization]); // Depend on 'code' to trigger scroll on update


  /* --------------------------------------------------------------------------
     COLLAPSIBILITY LOGIC
     -------------------------------------------------------------------------- */

  const isCollapsible = useMemo(() => {
    if (heightOverride) return false;
    if (lines.length === 0 || isMinimalistView) return false;

    if (collapsible !== undefined) return collapsible;

    // Auto-detection based on content height.
    const lineCount = safeItemData.length > 0 ? safeItemData.length : lines.length;
    const contentHeight = lineCount * CONFIG.LINE_HEIGHT + CONFIG.VERTICAL_PADDING;

    return contentHeight > collapsedHeight * 1.25;
  }, [
    collapsible,
    lines.length,
    safeItemData.length,
    collapsedHeight,
    isMinimalistView,
    heightOverride,
  ]);

  useEffect(() => {
    if (!isCollapsible) {
      setExpanded(true);
    }
  }, [isCollapsible]);

  /* --------------------------------------------------------------------------
     EVENT HANDLERS
     -------------------------------------------------------------------------- */

  const doCopy = useCallback(async () => {
    if (copied) return; // Prevent spam clicks

    const ok = await writeClipboard(code);
    if (ok) {
      setCopied(true);
      setAnnouncement('Code copied to clipboard.');
      onCopy?.(code);

      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        setTimeout(
          () => setAnnouncement((prev) => (prev === 'Code copied to clipboard.' ? '' : prev)),
          500
        );
      }, CONFIG.COPY_CONFIRMATION_DURATION);
    } else {
      setCopied(false);
      setAnnouncement('Failed to copy code. Please check browser permissions.');
       setTimeout(() => {
          setAnnouncement('');
        }, 5000);
    }
  }, [code, onCopy, copied]);

  const toggleWrap = useCallback(() => {
    setIsWrapped((v) => {
      const newValue = !v;
      const virtualizationStatus =
        newValue && lines.length > CONFIG.VIRTUALIZATION_THRESHOLD
          ? ' Performance optimization disabled.'
          : '';
      setAnnouncement(
        `Line wrapping ${newValue ? 'enabled' : 'disabled'}.${virtualizationStatus}`
      );
      return newValue;
    });
  }, [lines.length]);

  const toggleExpanded = useCallback(
    (focusOnExpand = false) => {
      setExpanded((v) => {
        const newExpandedState = !v;
        setAnnouncement(`Code block ${newExpandedState ? 'expanded' : 'collapsed'}.`);

        // A11y: Move focus into the code area when expanding via the overlay button.
        if (newExpandedState && focusOnExpand) {
          setTimeout(() => {
            const target = useVirtualization
              ? virtualizedOuterRef.current
              : nonVirtualizedContainerRef.current;
            target?.focus();
          }, 0);
        }
        return newExpandedState;
      });
    },
    [useVirtualization]
  );

  // Keyboard shortcuts (A11y).
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Alt+Z: Toggle wrap
      if (event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        toggleWrap();
      }

      // Ctrl/Cmd+Shift+C: Copy
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'c'
      ) {
        event.preventDefault();
        doCopy();
      }

      // Ctrl/Cmd+.: Toggle expand/collapse
      if ((event.ctrlKey || event.metaKey) && event.key === '.') {
        if (isCollapsible) {
          event.preventDefault();
          toggleExpanded(false);
        }
      }
    },
    [toggleWrap, doCopy, toggleExpanded, isCollapsible]
  );

  /* --------------------------------------------------------------------------
     BLOB URL FOR DOWNLOAD
     -------------------------------------------------------------------------- */
  const blobUrl = useMemo(() => {
    if (typeof window === 'undefined' || !code) return undefined;
    try {
      const mimeType =
        detectedLanguage === 'javascript' || detectedLanguage === 'typescript'
          ? 'text/javascript'
          : 'text/plain';
      const blob = new Blob([code], { type: `${mimeType};charset=utf-8` });
      return URL.createObjectURL(blob);
    } catch {
      return undefined;
    }
  }, [code, detectedLanguage]);

   const downloadName = useMemo(() => getDownloadName(filename, detectedLanguage), [filename, detectedLanguage]);

  // Effect: Clean up the Blob URL and timers.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, [blobUrl]);

  /* --------------------------------------------------------------------------
     STYLING DEFINITIONS
     -------------------------------------------------------------------------- */

  const highlighterBaseStyle: CSSProperties = useMemo(
    () => ({
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '0.875rem', // text-sm (14px)
      lineHeight: '1.6', // leading-normal (Matches CONFIG.LINE_HEIGHT)
      backgroundColor: 'transparent',
      margin: 0,
      padding: 0,
    }),
    []
  );

  const lineNumberStyle: CSSProperties = useMemo(
    () => ({
      minWidth: '3em',
      paddingRight: '1em',
      textAlign: 'right',
      userSelect: 'none',
      color: '#6b7280', // text-gray-500
      display: 'inline-block',
      boxSizing: 'border-box',
    }),
    []
  );

  const linePropsRenderer = useCallback(
    (lineNumber: number) => {
      const style: CSSProperties = {
        display: 'block',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      };
      const isHighlighted = highlights.has(lineNumber);

      if (isHighlighted) {
        style.backgroundColor = CONFIG.HIGHLIGHT_COLOR;
        style.borderLeft = `2px solid ${CONFIG.HIGHLIGHT_BORDER_COLOR}`;
        style.paddingLeft = 'calc(1rem - 2px)';
      }
      return { style };
    },
    [highlights]
  );

  /* --------------------------------------------------------------------------
     VIRTUALIZATION PROCESSOR (Core Integration Logic)
     -------------------------------------------------------------------------- */

  /**
   * A custom renderer used during the hidden pre-processing step to capture
   * the structure generated by SyntaxHighlighter for virtualization.
   */
  const virtualizationProcessor = useCallback(
    ({ rows }: RendererProps): React.ReactNode => {
      const safeRows = Array.isArray(rows)
        ? rows.filter((row): row is React.ReactElement => React.isValidElement(row))
        : [];

      if (needsProcessingRef.current && safeRows.length > 0) {
        // Stabilize keys for React's reconciliation.
        const stabilizedRows = safeRows.map((row, index) => {
          const stableKey = `cb-v-line-${index}`;
          if (!row.key || row.key !== stableKey) {
            return React.cloneElement(row, { key: stableKey });
          }
          return row;
        });

        // Store the processed rows and signal completion.
        highlightedRowsRef.current = stabilizedRows;
        needsProcessingRef.current = false;

        // Clear the processing timeout.
        if (processingTimeoutRef.current) {
          window.clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }

        // Schedule a state update (re-render) in the next microtask.
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(() => {
              setRenderCounter((prev) => prev + 1);
            });
        } else {
            Promise.resolve().then(() => {
                setRenderCounter((prev) => prev + 1);
            });
        }
      }

      return null;
    }, []);

  /* --------------------------------------------------------------------------
     NON-VIRTUALIZED RENDERER PROPS
     -------------------------------------------------------------------------- */
  const nonVirtualizedProps: NonVirtualizedRendererProps = useMemo(
    () => ({
      containerRef: nonVirtualizedContainerRef,
      onScroll: handleNonVirtualizedScroll,
      detectedLanguage,
      theme,
      highlighterBaseStyle,
      showLineNumbers,
      lineNumberStyle,
      isWrapped,
      linePropsRenderer,
      code,
      // A11y: Make the code area non-focusable when collapsed.
      tabIndex: isCollapsible && !expanded ? -1 : 0,
    }),
    [
      handleNonVirtualizedScroll,
      detectedLanguage,
      theme,
      highlighterBaseStyle,
      showLineNumbers,
      lineNumberStyle,
      isWrapped,
      linePropsRenderer,
      code,
      isCollapsible,
      expanded,
    ]
  );

  /* --------------------------------------------------------------------------
     VIEWPORT HEIGHT CALCULATION
     -------------------------------------------------------------------------- */

  const viewportHeight = useMemo(() => {
    if (heightOverride) return heightOverride;
    if (isMinimalistView) return 'auto';

    const lineCount = safeItemData.length > 0 ? safeItemData.length : lines.length;
    const contentHeight = lineCount * CONFIG.LINE_HEIGHT + CONFIG.VERTICAL_PADDING;

    if (isCollapsible && !expanded) {
      return collapsedHeight;
    }

    const maxHeight = typeof window !== 'undefined'
        ? window.innerHeight * CONFIG.MAX_VIEWPORT_HEIGHT_RATIO
        : 600;

    return Math.min(maxHeight, contentHeight);
  }, [
    isCollapsible,
    expanded,
    lines.length,
    safeItemData.length,
    collapsedHeight,
    isMinimalistView,
    heightOverride,
  ]);

  /* --------------------------------------------------------------------------
     INLINE CODE RENDERING
     -------------------------------------------------------------------------- */
  if (renderMode === 'inline') {
    return (
      <code
        className={cn(
          'px-1.5 py-0.5 mx-0.5 rounded font-mono text-[0.9em] break-words shadow-sm',
          // Styling: distinct background and border.
          'bg-zinc-800 border border-white/10 text-gray-200',
          className
        )}
      >
        {code}
      </code>
    );
  }

  /* --------------------------------------------------------------------------
     EMPTY BLOCK HANDLING
     -------------------------------------------------------------------------- */
  if (lines.length === 0) {
    // Render an empty state if filename is provided or streaming is active.
    if (filename || isStreaming) {
      return (
        <div
          className={cn(
            'my-6 rounded-xl overflow-hidden shadow-lg bg-zinc-950 border border-white/10',
            className
          )}
          role="region"
          aria-label={filename ? `Empty code block for ${filename}` : 'Code block'}
        >
         {(!isMinimalistView || filename) && (
             <CodeHeader
              label={filename?.trim() || detectedLanguage}
              Icon={HeaderIcon}
              isWrapped={isWrapped}
              toggleWrap={toggleWrap}
              isCollapsible={false}
              isExpanded={true}
              toggleExpanded={() => {}}
              downloadUrl={undefined}
              downloadName={downloadName}
              copied={false}
              doCopy={() => {}}
              isStreaming={isStreaming}
            />
         )}
          <div className="p-4 text-sm text-gray-500 font-mono" aria-live="polite" style={{ height: heightOverride || 'auto' }}>
             {isStreaming ? (
              // Blinking cursor effect for streaming initialization
              <>
                <style>
                {`
                  @keyframes blink-caret-block {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                  }
                  .animate-blink-caret-block {
                    animation: blink-caret-block 1s step-end infinite;
                  }
                  @media (prefers-reduced-motion: reduce) {
                    .animate-blink-caret-block { animation: none; }
                  }
                `}
                </style>
                <span className="inline-block w-2 h-4 bg-blue-500 align-text-bottom animate-blink-caret-block" aria-hidden="true" />
              </>
            ) : (
              <span className='italic'>(File is empty)</span>
            )}
          </div>
        </div>
      );
    }
    return null;
  }

  /* --------------------------------------------------------------------------
     MAIN BLOCK RENDERING
     -------------------------------------------------------------------------- */
  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label={filename ? `Code block for ${filename}` : 'Code block'}
      className={cn(
        'group relative my-6 rounded-xl overflow-hidden transition-all duration-300 ease-in-out',
        'focus-within:ring-2 focus-within:ring-blue-500/70',
        // Core styling: Deep background, subtle border, and shadow for depth.
        'bg-zinc-950 border border-white/10',
        isMinimalistView
          ? 'shadow-md hover:shadow-lg'
          : 'shadow-xl hover:shadow-2xl',
        className
      )}
      data-language={detectedLanguage}
    >
      <LiveAnnouncer message={announcement} />

      {/* Header or Toolbar */}
      {isMinimalistView ? (
        <HoverToolbar
          isWrapped={isWrapped}
          toggleWrap={toggleWrap}
          downloadUrl={blobUrl}
          downloadName={downloadName}
          copied={copied}
          doCopy={doCopy}
        />
      ) : (
        <CodeHeader
          label={filename?.trim() || detectedLanguage}
          Icon={HeaderIcon}
          isWrapped={isWrapped}
          toggleWrap={toggleWrap}
          isCollapsible={isCollapsible}
          isExpanded={expanded}
          toggleExpanded={toggleExpanded}
          downloadUrl={blobUrl}
          downloadName={downloadName}
          copied={copied}
          doCopy={doCopy}
          isStreaming={isStreaming}
        />
      )}

      {/* Code Viewport */}
      <div
        className="relative transition-all duration-300 ease-in-out text-neutral-100"
        style={{
          height: viewportHeight,
          overflow: isMinimalistView && viewportHeight === 'auto' ? 'visible' : 'hidden',
        }}
      >
        {/* Collapse Overlay (Fade effect and Expand button) */}
        {isCollapsible && !expanded && (
          <div
            onClick={() => toggleExpanded(true)}
            className="cursor-pointer absolute inset-x-0 bottom-0 h-32 z-10 flex items-end justify-center pb-4 transition-opacity duration-200 hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ring-inset"
            // Gradient fade effect
            style={{ background: 'linear-gradient(to top, rgba(9, 9, 11, 0.98) 30%, transparent 100%)' }}
            title="Expand code (Ctrl/⌘ + .)"
            role="button"
            aria-label="Expand code block"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleExpanded(true);
              }
            }}
          >
            {/* Expand Button */}
            <span className="text-sm font-medium text-white/90 bg-zinc-800/70 px-4 py-2 rounded-lg shadow-xl backdrop-blur-md border border-white/20 hover:bg-zinc-800 transition-colors duration-200 ease-out">
              Expand Code
            </span>
          </div>
        )}

        {/* Virtualization Boundary and Content Rendering */}
        <CodeBlockErrorBoundary
          context={useVirtualization ? "Virtualization" : "Standard"}
          fallbackRenderer={() => <NonVirtualizedRenderer {...nonVirtualizedProps} />}
        >
          {useVirtualization ? (
            <>
              {/* Hidden Pre-processor: Renders the code off-screen to capture the structure. */}
              {needsProcessingRef.current && (
                <div style={{ display: 'none', visibility: 'hidden' }} aria-hidden="true">
                  <SyntaxHighlighter
                    language={detectedLanguage}
                    style={theme}
                    customStyle={highlighterBaseStyle}
                    codeTagProps={{ style: { fontFamily: highlighterBaseStyle.fontFamily } }}
                    showLineNumbers={showLineNumbers}
                    lineNumberStyle={lineNumberStyle}
                    wrapLines={true}
                    lineProps={linePropsRenderer}
                    // Use the custom processor renderer.
                    renderer={virtualizationProcessor as any}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              )}

              {/* Virtualized List Container */}
              <div className="h-full w-full">
                <AutoSizer>
                  {({ width, height }) => {
                    const safeWidth = width || 0;
                    const safeHeight = height || 0;
                    const isDataReady = !needsProcessingRef.current && safeItemData.length > 0;
                    const isLayoutReady = safeWidth > 0 && safeHeight > 0;

                    // Display loading/processing indicator.
                    if (!isDataReady || !isLayoutReady) {
                      return (
                        <div
                          className="flex items-center justify-center h-full w-full relative overflow-hidden transition-opacity duration-300 ease-in-out"
                          style={{ background: 'rgba(0, 0, 0, 0.1)' }}
                          aria-live="polite"
                          role="status"
                          aria-label="Analyzing code structure"
                        >
                          {/* Processing Indicator Pill */}
                           <div className="px-6 py-3 rounded-xl shadow-xl backdrop-blur-lg bg-zinc-800/70 border border-white/20 flex items-center font-mono text-sm text-white/90">
                                <Loader2 size={16} className="animate-spin mr-3" />
                                <span>Analyzing...</span>
                            </div>
                        </div>
                      );
                    }

                    // Render the virtualized list.
                    return (
                      <FixedSizeList
                        ref={listRef}
                        outerRef={virtualizedOuterRef}
                        height={safeHeight}
                        itemCount={safeItemData.length}
                        itemSize={CONFIG.LINE_HEIGHT}
                        width={safeWidth}
                        itemData={safeItemData}
                        initialScrollOffset={lastScrollTop.current}
                        onScroll={handleListScroll}
                        innerElementType={VirtualizedInnerContainer}
                        tabIndex={isCollapsible && !expanded ? -1 : 0}
                        className="code-scrollbar focus:outline-none"
                        role="code"
                        aria-label="Virtualized code content"
                        style={{
                          overflowX: 'auto',
                          overflowY: 'auto',
                          willChange: 'transform',
                          ...highlighterBaseStyle,
                        }}
                      >
                        {VirtualizedRow}
                      </FixedSizeList>
                    );
                  }}
                </AutoSizer>
              </div>
            </>
          ) : (
            // Fallback to standard rendering.
            <NonVirtualizedRenderer {...nonVirtualizedProps} />
          )}
        </CodeBlockErrorBoundary>
      </div>
    </div>
  );
};