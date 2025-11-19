// FILE: src/components/CodeBlock.tsx
// DESC: A production-ready, accessible code block component with virtualization support,
//       syntax highlighting, and comprehensive features for displaying code in React applications.

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  forwardRef,
  Component,
  memo,
} from 'react';
import { List as FixedSizeList, ListChildComponentProps as RWListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { PrismStyle } from 'react-syntax-highlighter/dist/esm/types';

// Language imports
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

// Icons
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  WrapText,
  FileCode,
  AlertTriangle,
} from 'lucide-react';

// Utilities
import { cn, getFileExtension } from '../lib/utils';

/* ============================================================================
   LANGUAGE REGISTRATION
   ============================================================================ */

const REGISTERED_LANGUAGES = new Set<string>();

/**
 * Registers a language and its aliases with the syntax highlighter.
 * @param aliases - Array of language identifiers (e.g., ['javascript', 'js'])
 * @param language - The Prism language definition
 */
const register = (aliases: string[], language: any) => {
  aliases.forEach(alias => {
    try {
      SyntaxHighlighter.registerLanguage(alias, language);
      REGISTERED_LANGUAGES.add(alias);
    } catch (error) {
      console.warn(`Failed to register language alias: ${alias}`, error);
    }
  });
};

// Register all supported languages
register(['javascript', 'js'], javascript);
register(['typescript', 'ts'], typescript);
register(['jsx'], jsx);
register(['tsx'], tsx);
register(['python', 'py'], python);
register(['css'], css);
register(['html', 'xml', 'markup'], markup);
register(['bash', 'shell'], bash);
register(['json'], json);
register(['yaml', 'yml'], yaml);
register(['sql'], sql);
register(['markdown', 'md'], markdown);
REGISTERED_LANGUAGES.add('text');

/* ============================================================================
   CONFIGURATION
   ============================================================================ */

const CONFIG = {
  COPY_CONFIRMATION_DURATION: 2000,
  DEFAULT_COLLAPSED_HEIGHT: 384,
  LINE_HEIGHT: 22.4, // 14px font-size * 1.6 line-height
  SMART_INLINE_MAX_LENGTH: 80,
  MINIMALIST_VIEW_MAX_LINES: 5,
  VIRTUALIZATION_THRESHOLD: 150,
  VIRTUALIZATION_PROCESSING_TIMEOUT: 2500,
  VERTICAL_PADDING: 32, // 1rem top + 1rem bottom
};

const ICON_SIZE = {
  STANDARD: 16,
  MINIMAL: 18,
  HEADER: 14,
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
  onClick?: () => void;
  href?: string;
  download?: string;
  className?: string;
  minimal?: boolean;
}

interface CodeHeaderProps {
  label: string;
  isWrapped: boolean;
  toggleWrap: () => void;
  isCollapsible: boolean;
  isExpanded: boolean;
  toggleExpanded: (focusOnExpand?: boolean) => void;
  downloadUrl: string | undefined;
  downloadName: string;
  copied: boolean;
  doCopy: () => void;
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
  highlighterBaseStyle: React.CSSProperties;
  showLineNumbers: boolean;
  lineNumberStyle: React.CSSProperties;
  isWrapped: boolean;
  linePropsRenderer: (lineNumber: number) => { style: React.CSSProperties };
  code: string;
  tabIndex?: number;
}

type ItemData = React.ReactElement[];
type ListChildComponentProps = RWListChildComponentProps<ItemData>;

/* ============================================================================
   UTILITY FUNCTIONS
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
 * Parses highlight specification into an array of line numbers.
 * Supports formats: "1,3,5" or "1-5,10" or [1, 3, 5]
 */
function parseHighlightSpec(spec?: string | number[]): number[] {
  if (!spec) return [];
  if (Array.isArray(spec)) return spec.filter((n) => n > 0);

  const highlights: number[] = [];
  const tokens = String(spec)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (token.includes('-')) {
      const [start, end] = token.split('-').map((s) => parseInt(s.trim(), 10));
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          if (i > 0) highlights.push(i);
        }
      }
    } else {
      const n = parseInt(token, 10);
      if (Number.isFinite(n) && n > 0) highlights.push(n);
    }
  }
  return highlights;
}

/**
 * Generates a download filename based on the provided filename or language.
 */
function getDownloadName(filename: string | undefined, language: string): string {
  if (filename?.trim()) return filename.trim();
  const ext = getFileExtension(language);
  return `snippet.${ext}`;
}

/**
 * Writes text to the clipboard using the Clipboard API or fallback methods.
 */
async function writeClipboard(text: string): Promise<boolean> {
  // Modern Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Clipboard API failed, falling back to execCommand.', err);
    }
  }

  // Legacy fallback
  if (typeof document !== 'undefined' && document.execCommand) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.setAttribute('readonly', '');
      textarea.style.left = '-9999px';

      document.body.appendChild(textarea);

      const selection = document.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      selection?.removeAllRanges();
      selection?.addRange(range);
      textarea.setSelectionRange(0, text.length);

      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      console.error('execCommand copy failed.', err);
      return false;
    }
  }
  return false;
}

/* ============================================================================
   VIRTUALIZED COMPONENTS
   ============================================================================ */

/**
 * Inner container for FixedSizeList that applies vertical padding.
 */
const VirtualizedInnerContainer = memo(
  forwardRef<HTMLDivElement, React.HTMLProps<HTMLDivElement>>(({ style, ...rest }, ref) => (
    <div
      ref={ref}
      style={{
        ...style,
        paddingTop: '1rem',
        paddingBottom: '1rem',
        boxSizing: 'border-box',
      }}
      {...rest}
    />
  ))
);
VirtualizedInnerContainer.displayName = 'VirtualizedInnerContainer';

/**
 * Renders individual rows within the virtualized list.
 */
const VirtualizedRow = memo(({ index, style, data }: ListChildComponentProps) => {
  if (!Array.isArray(data) || data.length === 0 || index >= data.length) {
    return null;
  }

  const row = data[index];

  if (!row || !React.isValidElement(row) || !row.props) {
    return (
      <div
        style={{
          ...style,
          color: '#f87171',
          backgroundColor: 'rgba(248, 113, 113, 0.1)',
          paddingLeft: '1rem',
          fontStyle: 'italic',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label={`Error rendering line ${index + 1}`}
      >
        (Line rendering failed)
      </div>
    );
  }

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
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary for virtualization failures.
 * Falls back to non-virtualized rendering on error.
 */
class VirtualizationErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      'CodeBlock Virtualization runtime error caught. Falling back to standard rendering.',
      error,
      errorInfo
    );
  }

  render() {
    if (typeof FixedSizeList === 'undefined' || !FixedSizeList) {
      return (
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-hidden">{this.props.fallbackRenderer()}</div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col">
          <div
            className="px-4 py-1 bg-yellow-950/50 border-b border-yellow-600/50 text-xs text-yellow-400"
            role="alert"
          >
            Warning: Virtualization disabled due to a runtime error. Displaying in standard mode.
          </div>
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
 * Screen reader announcer for accessibility.
 */
const LiveAnnouncer: React.FC<{ message: string }> = memo(({ message }) => (
  <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
    {message}
  </div>
));
LiveAnnouncer.displayName = 'LiveAnnouncer';

/**
 * Reusable toolbar action button/link component.
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
      minimal = false,
    },
    ref
  ) => {
    const baseClasses = cn(
      'inline-flex items-center transition-colors duration-100 ease-in-out',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      minimal
        ? 'p-1.5 rounded-lg'
        : 'gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900/70',
      disabled
        ? 'text-gray-600 cursor-not-allowed opacity-40'
        : cn(
            'text-gray-400 hover:text-white hover:bg-white/10',
            active && (minimal ? 'text-white bg-white/15' : 'bg-white/10 text-white')
          )
    );

    const iconSize = minimal ? ICON_SIZE.MINIMAL : ICON_SIZE.STANDARD;

    const content = (
      <>
        <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />
        {!minimal && <span className="hidden sm:inline">{label}</span>}
      </>
    );

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
          onClick={(e) => {
            if (disabled) e.preventDefault();
            onClick?.();
          }}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
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
 * Header component with file info and action buttons.
 */
const CodeHeader: React.FC<CodeHeaderProps> = memo(
  ({
    label,
    isWrapped,
    toggleWrap,
    isCollapsible,
    isExpanded,
    toggleExpanded,
    downloadUrl,
    downloadName,
    copied,
    doCopy,
  }) => {
    return (
      <>
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-gradient-to-br from-gray-900/90 to-black/90 border-b border-purple-400/10 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <FileCode size={ICON_SIZE.HEADER} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 truncate block">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarAction
            icon={WrapText}
            onClick={toggleWrap}
            label={isWrapped ? 'Unwrap' : 'Wrap'}
            tooltip="Toggle line wrap (Alt+Z). Note: Wrapping disables virtualization."
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
            tooltip="Download code as file"
            disabled={!downloadUrl}
          />

          <ToolbarAction
            icon={copied ? Check : Copy}
            onClick={doCopy}
            label={copied ? 'Copied' : 'Copy'}
            tooltip="Copy code (Ctrl/⌘+Shift+C)"
            className={copied ? 'text-green-400 hover:text-green-400 !bg-green-500/20' : ''}
          />
        </div>
      </div>
      </>
    );
  }
);
CodeHeader.displayName = 'CodeHeader';

/**
 * Hover toolbar for minimalist view.
 */
const HoverToolbar: React.FC<HoverToolbarProps> = memo(
  ({ isWrapped, toggleWrap, downloadUrl, downloadName, copied, doCopy }) => {
    return (
      <div className="absolute top-2 right-2 z-20 transition-opacity duration-300 ease-in-out opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-auto">
        <div className="flex items-center gap-1 bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-lg rounded-xl p-0.5 shadow-xl border border-purple-400/20">
          <ToolbarAction
            minimal
            icon={WrapText}
            onClick={toggleWrap}
            label=""
            tooltip="Toggle line wrap (Alt+Z)"
            active={isWrapped}
          />

          <ToolbarAction
            minimal
            icon={Download}
            href={downloadUrl ?? undefined}
            download={downloadName}
            label=""
            tooltip="Download code as file"
            disabled={!downloadUrl}
          />

          <ToolbarAction
            minimal
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
 * Non-virtualized renderer for standard code display.
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
      className='overflow-auto custom-scrollbar h-full py-4 transition-opacity duration-200 ease-in-out focus:outline-none'
      onScroll={onScroll}
      tabIndex={tabIndex}
      role="code"
      aria-label="Code content"
    >
      <SyntaxHighlighter
        language={detectedLanguage}
        style={theme}
        customStyle={highlighterBaseStyle}
        codeTagProps={{ style: { fontFamily: highlighterBaseStyle.fontFamily } }}
        showLineNumbers={showLineNumbers}
        lineNumberStyle={lineNumberStyle}
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
    theme = vscDarkPlus,
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
  const lastScrollTop = useRef<number>(0);
  const copiedTimer = useRef<number | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);

  /* --------------------------------------------------------------------------
     CONTENT EXTRACTION & NORMALIZATION
     -------------------------------------------------------------------------- */
  const rawInput = value ?? extractText(children);
  const safeInput = typeof rawInput === 'string' ? rawInput : String(rawInput || '');
  const code = useMemo(() => safeInput.replace(/\r\n/g, '\n').trim(), [safeInput]);

  /* --------------------------------------------------------------------------
     RENDERING MODE DETECTION
     -------------------------------------------------------------------------- */
  const renderMode = useMemo((): 'inline' | 'block' => {
    if (inline) return 'inline';
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

  /* --------------------------------------------------------------------------
     DATA PREPARATION
     -------------------------------------------------------------------------- */
  const lines = useMemo(() => (code === '' ? [] : code.split('\n')), [code]);
  const highlights = useMemo(() => parseHighlightSpec(highlightLines), [highlightLines]);
  const isMinimalistView = lines.length <= CONFIG.MINIMALIST_VIEW_MAX_LINES && lines.length > 0;

  /* --------------------------------------------------------------------------
     STATE
     -------------------------------------------------------------------------- */
  const [isWrapped, setIsWrapped] = useState<boolean>(wrap);
  const [copied, setCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [renderCounter, setRenderCounter] = useState<number>(0);
  const [expanded, setExpanded] = useState<boolean>(true);
  const [virtualizationDisabled, setVirtualizationDisabled] = useState<boolean>(false);

  /* --------------------------------------------------------------------------
     VIRTUALIZATION LOGIC
     -------------------------------------------------------------------------- */
  const useVirtualization = useMemo(() => {
    if (typeof FixedSizeList === 'undefined' || !FixedSizeList || virtualizationDisabled) {
      return false;
    }
    if (isStreaming) {
      return false;
    }
    return !isWrapped && lines.length > CONFIG.VIRTUALIZATION_THRESHOLD;
  }, [isStreaming, isWrapped, virtualizationDisabled, lines.length]);

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

    processingTimeoutRef.current = window.setTimeout(() => {
      if (needsProcessingRef.current) {
        console.warn(`CodeBlock virtualization processing timed out (${CONFIG.VIRTUALIZATION_PROCESSING_TIMEOUT}ms). Falling back to standard rendering.`);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!useVirtualization && nonVirtualizedContainerRef.current) {
        nonVirtualizedContainerRef.current.scrollTop = lastScrollTop.current;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [useVirtualization]);

  const safeItemData = useMemo(() => highlightedRowsRef.current || [], [renderCounter]);

  /* --------------------------------------------------------------------------
     COLLAPSIBILITY LOGIC
     -------------------------------------------------------------------------- */
  const isCollapsible = useMemo(() => {
    if (heightOverride) return false;
    if (lines.length === 0 || isMinimalistView) return false;
    if (collapsible !== undefined) return collapsible;

    const currentHeight =
      (safeItemData.length > 0 ? safeItemData.length : lines.length) * CONFIG.LINE_HEIGHT;

    return currentHeight + CONFIG.VERTICAL_PADDING > collapsedHeight * 1.25;
  }, [
    collapsible,
    lines.length,
    safeItemData.length,
    collapsedHeight,
    isMinimalistView,
    heightOverride,
  ]);

  useEffect(() => {
    if (isMinimalistView || !isCollapsible) {
      setExpanded(true);
    }
  }, [isMinimalistView, isCollapsible]);

  /* --------------------------------------------------------------------------
     EVENT HANDLERS
     -------------------------------------------------------------------------- */
  const doCopy = useCallback(async () => {
    try {
      setCopyError(false);
      const ok = await writeClipboard(code);
      if (ok) {
        setCopied(true);
        setCopyError(false);
        setAnnouncement('Code copied to clipboard.');
        onCopy?.(code);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => {
          setCopied(false);
          setTimeout(
            () =>
              setAnnouncement((prev) => (prev === 'Code copied to clipboard.' ? '' : prev)),
            500
          );
        }, CONFIG.COPY_CONFIRMATION_DURATION);
      } else {
        setCopyError(true);
        setCopied(false);
        setAnnouncement('Failed to copy code. Please try again.');
        setTimeout(() => {
          setCopyError(false);
          setAnnouncement('');
        }, 3000);
      }
    } catch (error) {
      console.error('Copy operation failed:', error);
      setCopyError(true);
      setCopied(false);
      setAnnouncement('Failed to copy code. Please try again.');
      setTimeout(() => {
        setCopyError(false);
        setAnnouncement('');
      }, 3000);
    }
  }, [code, onCopy]);

  const toggleWrap = useCallback(() => {
    setIsWrapped((v) => {
      const newValue = !v;
      const virtualizationStatus =
        newValue && lines.length > CONFIG.VIRTUALIZATION_THRESHOLD
          ? ' Virtualization disabled.'
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

  const handleListScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    lastScrollTop.current = scrollOffset;
  }, []);

  const handleNonVirtualizedScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    lastScrollTop.current = event.currentTarget.scrollTop;
  }, []);

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

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, [blobUrl]);

  /* --------------------------------------------------------------------------
     STYLING
     -------------------------------------------------------------------------- */
  const highlighterBaseStyle: React.CSSProperties = useMemo(
    () => ({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '0.875rem',
      lineHeight: '1.6',
      backgroundColor: 'transparent',
      margin: 0,
      padding: 0,
    }),
    []
  );

  const lineNumberStyle: React.CSSProperties = useMemo(
    () => ({
      minWidth: '2.5em',
      paddingRight: '1em',
      textAlign: 'right',
      userSelect: 'none',
      color: '#858585',
      display: 'inline-block',
    }),
    []
  );

  const linePropsRenderer = useCallback(
    (lineNumber: number) => {
      const style: React.CSSProperties = {
        display: 'block',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      };
      const isHighlighted = highlights.includes(lineNumber);

      if (isHighlighted) {
        style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
        style.borderLeft = '2px solid #3b82f6';
        style.paddingLeft = 'calc(1rem - 2px)';
      }
      return { style };
    },
    [highlights]
  );

  /* --------------------------------------------------------------------------
     VIRTUALIZATION PROCESSOR (THE CRITICAL FIX)
     -------------------------------------------------------------------------- */
  const virtualizationProcessor: (props: { rows: React.ReactNode[] }) => React.ReactNode =
    useCallback(({ rows }) => {
      const safeRows = Array.isArray(rows)
        ? rows.filter((row): row is React.ReactElement => React.isValidElement(row))
        : [];

      if (needsProcessingRef.current && safeRows.length > 0) {
        const stabilizedRows = safeRows.map((row, index) => {
          const stableKey = `cb-line-${index}`;
          if (!row.key || row.key !== stableKey) {
            return React.cloneElement(row, { key: stableKey });
          }
          return row;
        });

        highlightedRowsRef.current = stabilizedRows;
        needsProcessingRef.current = false;

        if (processingTimeoutRef.current) {
          window.clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }

        queueMicrotask(() => {
          setRenderCounter((prev) => prev + 1);
        });
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

    const contentHeight =
      (safeItemData.length > 0 ? safeItemData.length : lines.length) * CONFIG.LINE_HEIGHT +
      CONFIG.VERTICAL_PADDING;

    if (isCollapsible && !expanded) {
      return collapsedHeight;
    }

    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600;
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
          'px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[0.85em] break-words shadow-sm',
          'bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-purple-400/20 text-purple-300',
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
    if (filename) {
      return (
        <div
          className={cn(
            'my-6 rounded-xl overflow-hidden shadow-lg bg-zinc-950 border border-white/10',
            className
          )}
          role="region"
          aria-label={`Empty code block for ${filename}`}
        >
          <div className="px-3 sm:px-4 py-2 bg-gradient-to-br from-gray-900/90 to-black/90 border-b border-purple-400/10">
            <div className="flex items-center gap-3 min-w-0">
              <FileCode size={ICON_SIZE.HEADER} className="text-gray-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-200 truncate block">
                {filename}
              </span>
            </div>
          </div>
          <div className="p-4 text-sm text-gray-500 italic font-mono" aria-live="polite">
            (File is empty)
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
        'group relative my-6 rounded-xl overflow-hidden transition-all duration-300 ease-in-out backdrop-blur-sm',
        'focus-within:ring-2 focus-within:ring-blue-500/70',
        isMinimalistView
          ? 'bg-zinc-950/80 border border-white/5 shadow-md hover:shadow-lg hover:border-white/10'
          : 'bg-zinc-950 border border-white/10 shadow-xl hover:shadow-2xl',
        className
      )}
      data-language={detectedLanguage}
    >
      <LiveAnnouncer message={announcement} />

      {/* Header/Toolbar */}
      {isMinimalistView ? (
        <HoverToolbar
          isWrapped={isWrapped}
          toggleWrap={toggleWrap}
          downloadUrl={blobUrl}
          downloadName={getDownloadName(filename, detectedLanguage)}
          copied={copied}
          doCopy={doCopy}
        />
      ) : (
        <CodeHeader
          label={filename?.trim() || detectedLanguage}
          isWrapped={isWrapped}
          toggleWrap={toggleWrap}
          isCollapsible={isCollapsible}
          isExpanded={expanded}
          toggleExpanded={toggleExpanded}
          downloadUrl={blobUrl}
          downloadName={getDownloadName(filename, detectedLanguage)}
          copied={copied}
          doCopy={doCopy}
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
        {/* Collapse Overlay */}
        {isCollapsible && !expanded && (
          <div
            onClick={() => toggleExpanded(true)}
            className="cursor-pointer absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950/95 to-transparent z-10 flex items-end justify-center pb-4 transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ring-inset"
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
            <span className="text-sm font-medium text-white/90 bg-gradient-to-br from-gray-800/60 to-gray-900/60 px-4 py-2 rounded-lg shadow-xl backdrop-blur-lg border border-purple-400/20 hover:from-gray-800/80 hover:to-gray-900/80 transition-colors duration-200 ease-out">
              Expand Code
            </span>
          </div>
        )}

        {/* Virtualization Boundary */}
        <VirtualizationErrorBoundary
          fallbackRenderer={() => <NonVirtualizedRenderer {...nonVirtualizedProps} />}
        >
          {useVirtualization ? (
            <>
              {needsProcessingRef.current && (
                <div style={{ display: 'none' }} aria-hidden="true">
                  <SyntaxHighlighter
                    language={detectedLanguage}
                    style={theme}
                    customStyle={highlighterBaseStyle}
                    codeTagProps={{ style: { fontFamily: highlighterBaseStyle.fontFamily } }}
                    showLineNumbers={showLineNumbers}
                    lineNumberStyle={lineNumberStyle}
                    wrapLines={true}
                    lineProps={linePropsRenderer}
                    // @ts-ignore - renderer prop type mismatch
                    renderer={virtualizationProcessor}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              )}

              <div className="h-full w-full">
                <AutoSizer>
                  {({ width, height }) => {
                    const safeWidth = width || 0;
                    const safeHeight = height || 0;
                    const isDataReady = !needsProcessingRef.current && safeItemData.length > 0;
                    const isLayoutReady = safeWidth > 0 && safeHeight > 0;

                    if (!isDataReady || !isLayoutReady) {
                      return (
                        <div
                          className="flex items-center justify-center h-full w-full relative overflow-hidden transition-opacity duration-300 ease-in-out processing-container"
                          style={{ background: 'rgba(0, 0, 0, 0.3)' }}
                          aria-live="polite"
                          role="status"
                          aria-label="Analyzing code structure"
                        >
                          <style>
                            {`
                              @keyframes shimmer {
                                0% { background-position: -200% 0; }
                                100% { background-position: 200% 0; }
                              }
                              @keyframes blink-block {
                                0%, 100% { opacity: 0; }
                                50% { opacity: 1; }
                              }
                              .animate-shimmer {
                                background-image: linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
                                background-size: 200% 100%;
                                animation: shimmer 1.5s linear infinite;
                              }
                              .animate-blink-block {
                                animation: blink-block 1.1s steps(1, end) infinite;
                              }
                              @media (prefers-reduced-motion: reduce) {
                                .animate-shimmer, .animate-blink-block {
                                  animation: none !important;
                                }
                              }
                            `}
                          </style>
                          <div className="px-6 py-3 rounded-xl shadow-xl backdrop-blur-lg bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-purple-400/20 relative overflow-hidden">
                            <div className="absolute inset-0 animate-shimmer" aria-hidden="true" />
                            <div className="flex items-center font-mono text-sm text-white/95 relative z-10">
                              <span>Analyzing code</span>
                              <span className="ml-1 animate-blink-block" aria-hidden="true">█</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

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
                        className="custom-scrollbar focus:outline-none"
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
            <NonVirtualizedRenderer {...nonVirtualizedProps} />
          )}
        </VirtualizationErrorBoundary>
      </div>
    </div>
  );
};