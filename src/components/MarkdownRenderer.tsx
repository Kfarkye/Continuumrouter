/* src/components/MarkdownRenderer.tsx */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { CodeBlock } from './CodeBlock';
import { LivePreviewSandbox } from './LivePreviewSandbox';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-invert prose-zinc max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : undefined;
            const value = String(children).replace(/\n$/, '');

            if (language === 'html' && value.includes('<body') && !inline) {
              return (
                <>
                  <LivePreviewSandbox code={value} />
                  <CodeBlock
                    language={language}
                    value={value}
                    {...props}
                  />
                </>
              );
            }

            if (!inline) {
              return (
                <CodeBlock
                  language={language}
                  value={value}
                  {...props}
                />
              );
            }

            return <CodeBlock inline value={value} className={className} {...props} />;
          },

          p: ({ children }) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
