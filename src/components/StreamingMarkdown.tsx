/**
 * StreamingMarkdown Component
 *
 * Optimized markdown renderer for streaming content with:
 * - Block-level memoization
 * - Partial markdown handling
 * - Minimal re-renders during streaming
 */

import React, { useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Components } from 'react-markdown';
import { PartialMarkdownDetector } from '../utils/streamingOptimizations';

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
  components?: Components;
  className?: string;
}

interface MarkdownBlock {
  id: string;
  content: string;
  type: 'stable' | 'streaming';
}

/**
 * Split content into stable and streaming blocks
 */
function splitIntoBlocks(content: string, isStreaming: boolean): MarkdownBlock[] {
  if (!isStreaming) {
    return [
      {
        id: 'final',
        content,
        type: 'stable',
      },
    ];
  }

  // Use the detector to split content intelligently
  const { stable, streaming } = PartialMarkdownDetector.splitStableContent(content);

  const blocks: MarkdownBlock[] = [];

  if (stable) {
    blocks.push({
      id: 'stable',
      content: stable,
      type: 'stable',
    });
  }

  if (streaming) {
    // Try to close incomplete markdown gracefully
    const closedStreaming = PartialMarkdownDetector.tryClose(streaming);

    blocks.push({
      id: 'streaming',
      content: closedStreaming,
      type: 'streaming',
    });
  }

  return blocks;
}

/**
 * Memoized markdown block - only re-renders when content changes
 */
const MarkdownBlock = memo<{
  content: string;
  components?: Components;
  className?: string;
}>(
  ({ content, components, className }) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        className={className}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content
);

MarkdownBlock.displayName = 'MarkdownBlock';

/**
 * Main StreamingMarkdown component
 */
export const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({
  content,
  isStreaming,
  components,
  className,
}) => {
  // Memoize block splitting
  const blocks = useMemo(
    () => splitIntoBlocks(content, isStreaming),
    [content, isStreaming]
  );

  // During streaming, only the last block re-renders
  return (
    <>
      {blocks.map((block) => (
        <MarkdownBlock
          key={block.id}
          content={block.content}
          components={components}
          className={className}
        />
      ))}
    </>
  );
};

/**
 * Hook for detecting incomplete markdown state
 */
export function useMarkdownState(content: string) {
  return useMemo(
    () => ({
      isIncomplete: PartialMarkdownDetector.isIncomplete(content),
      hasUnclosedCodeBlock: content.split('```').length % 2 === 0,
    }),
    [content]
  );
}
