/**
 * HTML/CSS/JS Detection Utility using Abstract Syntax Tree (AST) parsing
 *
 * This module provides robust detection of previewable code groups in markdown content.
 * It uses unified and remark-parse to create an AST, ensuring accurate identification
 * of consecutive HTML, CSS, and JavaScript code blocks.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Code, Root } from 'mdast';

/**
 * Represents a group of related code blocks that can be combined for live preview
 */
export interface PreviewGroup {
  /**
   * Indices of the code blocks in the markdown AST traversal order
   * Used to identify which blocks in the rendered markdown belong to this group
   */
  indices: number[];

  /**
   * HTML content (combined if multiple HTML blocks are consecutive)
   */
  html: string;

  /**
   * CSS content (combined if multiple CSS blocks are consecutive)
   */
  css: string;

  /**
   * JavaScript content (combined if multiple JS blocks are consecutive)
   */
  js: string;
}

/**
 * Analyzes markdown content using AST parsing to detect consecutive HTML, CSS, and JavaScript
 * code blocks suitable for live preview.
 *
 * This approach is robust as it understands markdown structure rather than using regex.
 *
 * @param markdownContent The raw markdown string from the AI message
 * @returns An array of detected PreviewGroups
 *
 * @example
 * ```typescript
 * const markdown = `
 * Here's a button:
 *
 * \`\`\`html
 * <button id="btn">Click me</button>
 * \`\`\`
 *
 * \`\`\`css
 * #btn { background: blue; color: white; }
 * \`\`\`
 *
 * \`\`\`javascript
 * document.getElementById('btn').onclick = () => alert('Hello!');
 * \`\`\`
 * `;
 *
 * const groups = detectSnippets(markdown);
 * // groups[0] will contain the combined HTML, CSS, and JS
 * ```
 */
export function detectSnippets(markdownContent: string): PreviewGroup[] {
  const groups: PreviewGroup[] = [];

  if (!markdownContent) return groups;

  // Use unified/remark to parse the markdown into an Abstract Syntax Tree (AST)
  let tree: Root;
  try {
    // Basic normalization before parsing (handle different line endings)
    const sanitizedContent = markdownContent.replace(/\r\n/g, '\n');
    tree = unified().use(remarkParse).parse(sanitizedContent) as Root;
  } catch (error) {
    console.error('Failed to parse markdown for snippet detection:', error);
    return [];
  }

  const codeBlocks: { node: Code; index: number }[] = [];

  // 1. Collect all code blocks and their indices in the AST traversal order
  let globalIndex = 0;
  visit(tree, 'code', (node: Code) => {
    codeBlocks.push({ node, index: globalIndex });
    globalIndex++;
  });

  // 2. Iterate through collected blocks to identify cohesive groups
  for (let i = 0; i < codeBlocks.length; i++) {
    const currentBlock = codeBlocks[i];
    const lang = currentBlock.node.lang?.toLowerCase();

    // Check if the block is a relevant language for preview
    if (lang === 'html' || lang === 'css' || lang === 'javascript' || lang === 'js') {
      const group: PreviewGroup = {
        indices: [],
        html: '',
        css: '',
        js: '',
      };

      let j = i;

      // Look ahead for subsequent blocks that are also part of the preview set.
      // Assumes related blocks appear consecutively in the AI response.
      while (j < codeBlocks.length) {
        const block = codeBlocks[j];
        const blockLang = block.node.lang?.toLowerCase();

        if (blockLang === 'html') {
          // Combine multiple HTML blocks with spacing
          group.html += (group.html ? '\n\n' : '') + block.node.value;
        } else if (blockLang === 'css') {
          // Combine multiple CSS blocks with spacing
          group.css += (group.css ? '\n\n' : '') + block.node.value;
        } else if (blockLang === 'javascript' || blockLang === 'js') {
          // Combine multiple JavaScript blocks with spacing
          group.js += (group.js ? '\n\n' : '') + block.node.value;
        } else {
          // A non-preview language block breaks the sequence
          break;
        }

        // Track this block's index as part of the group
        group.indices.push(block.index);
        j++;
      }

      // A group is valid for preview if it has HTML or JS
      // (JS can generate DOM elements even without HTML)
      if (group.html || group.js) {
        groups.push(group);
        // Advance the main iterator past the consumed blocks
        i = j - 1;
      }
    }
  }

  return groups;
}

/**
 * Helper function to check if a string represents a previewable language
 */
export function isPreviewableLanguage(language: string | undefined | null): boolean {
  if (!language) return false;
  const lang = language.toLowerCase();
  return lang === 'html' || lang === 'css' || lang === 'javascript' || lang === 'js';
}

/**
 * Helper function to get a user-friendly description of a preview group
 */
export function describePreviewGroup(group: PreviewGroup): string {
  const parts: string[] = [];
  if (group.html) parts.push('HTML');
  if (group.css) parts.push('CSS');
  if (group.js) parts.push('JavaScript');
  return parts.join(' + ');
}
