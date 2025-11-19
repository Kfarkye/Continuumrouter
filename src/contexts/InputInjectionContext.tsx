/**
 * Input Injection Context
 *
 * Provides a centralized way to inject content into the chat input from anywhere in the app.
 * Primary use case: Injecting code snippets from the sidebar directly into the input textarea.
 */

import React, { createContext, useContext, useCallback, useState, useRef } from 'react';

/* ──────────────────────────────── Types ──────────────────────────────── */

interface InputInjectionContextValue {
  injectContent: (content: string, options?: InjectionOptions) => void;
  registerInputRef: (ref: HTMLTextAreaElement | null) => void;
  lastInjectedId: string | null;
}

interface InjectionOptions {
  wrapInCodeBlock?: boolean;
  language?: string;
  focus?: boolean;
  append?: boolean;
  prependNewline?: boolean;
  appendNewline?: boolean;
}

/* ──────────────────────────────── Context ──────────────────────────────── */

const InputInjectionContext = createContext<InputInjectionContextValue | undefined>(undefined);

/* ──────────────────────────────── Provider ──────────────────────────────── */

export const InputInjectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [lastInjectedId, setLastInjectedId] = useState<string | null>(null);

  const registerInputRef = useCallback((ref: HTMLTextAreaElement | null) => {
    inputRef.current = ref;
  }, []);

  const injectContent = useCallback((content: string, options: InjectionOptions = {}) => {
    const {
      wrapInCodeBlock = true,
      language = '',
      focus = true,
      append = true,
      prependNewline = true,
      appendNewline = true,
    } = options;

    const textarea = inputRef.current;
    if (!textarea) {
      console.warn('InputInjection: No textarea registered');
      return;
    }

    // Format the content
    let formattedContent = content;

    if (wrapInCodeBlock) {
      formattedContent = `\`\`\`${language}\n${content}\n\`\`\``;
    }

    // Add spacing
    if (prependNewline && textarea.value.trim() !== '') {
      formattedContent = '\n\n' + formattedContent;
    }

    if (appendNewline) {
      formattedContent = formattedContent + '\n\n';
    }

    // Get current value and cursor position
    const currentValue = textarea.value;
    const cursorPosition = textarea.selectionStart;

    let newValue: string;
    let newCursorPosition: number;

    if (append) {
      // Append to end
      newValue = currentValue + formattedContent;
      newCursorPosition = newValue.length;
    } else {
      // Insert at cursor position
      newValue =
        currentValue.substring(0, cursorPosition) +
        formattedContent +
        currentValue.substring(cursorPosition);
      newCursorPosition = cursorPosition + formattedContent.length;
    }

    // Update textarea value
    textarea.value = newValue;

    // Trigger input event to notify React state
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);

    // Set cursor position
    textarea.setSelectionRange(newCursorPosition, newCursorPosition);

    // Focus if requested
    if (focus) {
      textarea.focus();
    }

    // Scroll to cursor
    textarea.scrollTop = textarea.scrollHeight;

    // Generate unique ID for this injection
    const injectionId = `injection-${Date.now()}`;
    setLastInjectedId(injectionId);
  }, []);

  const value: InputInjectionContextValue = {
    injectContent,
    registerInputRef,
    lastInjectedId,
  };

  return (
    <InputInjectionContext.Provider value={value}>
      {children}
    </InputInjectionContext.Provider>
  );
};

/* ──────────────────────────────── Hook ──────────────────────────────── */

export const useInputInjection = (): InputInjectionContextValue => {
  const context = useContext(InputInjectionContext);

  if (!context) {
    throw new Error('useInputInjection must be used within InputInjectionProvider');
  }

  return context;
};
