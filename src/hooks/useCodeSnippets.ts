// src/hooks/useCodeSnippets.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ChatMessage } from '../types';
import { extractCodeBlocks, detectFileType, ExtractedCodeBlock } from '../utils/codeExtractor';

// Browser-compatible function to convert byte array to hex string
function bytesToHex(bytes: Uint8Array | number[] | string): string {
  if (typeof bytes === 'string') return bytes;
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to validate UUID format
function isValidUUID(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

export interface CodeSnippet {
  id: string;
  messageId: string;
  conversationId: string;
  userId: string;
  language: string;
  content: string;
  contentHash?: string;
  lineCount: number;
  orderIndex: number;
  userDefinedName?: string;
  detectedFileName?: string;
  isBookmarked: boolean;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface SnippetBookmark {
  id: string;
  snippetId: string;
  folderPath?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  colorHex?: string;
  createdAt: string;
}

export interface SnippetTag {
  snippetId: string;
  tagId: string;
  userId: string;
}

interface UseCodeSnippetsArgs {
  sessionId: string | null;
  userId: string | null;
  messages: ChatMessage[];
}

export const useCodeSnippets = ({ sessionId, userId, messages }: UseCodeSnippetsArgs) => {
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [bookmarks, setBookmarks] = useState<SnippetBookmark[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const extractedMessagesRef = useRef<Set<string>>(new Set());

  // Fetch existing snippets from database
  const fetchSnippets = useCallback(async () => {
    if (!sessionId || !userId) return;

    setIsLoading(true);
    try {
      // Get conversation ID
      const { data: conversation } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (!conversation) {
        setSnippets([]);
        return;
      }

      // Fetch snippets
      const { data: snippetsData, error: snippetsError } = await supabase
        .from('code_snippets')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (snippetsError) throw snippetsError;

      // Fetch bookmarks
      const { data: bookmarksData, error: bookmarksError } = await supabase
        .from('snippet_bookmarks')
        .select('*')
        .eq('user_id', userId);

      if (bookmarksError) throw bookmarksError;

      // Fetch all user tags
      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId)
        .order('name');

      if (tagsError) throw tagsError;

      // Fetch snippet-tag associations
      const snippetIds = (snippetsData || []).map(s => s.id);
      let snippetTagsData: any[] = [];
      if (snippetIds.length > 0) {
        const { data, error: snippetTagsError } = await supabase
          .from('snippet_tags')
          .select('snippet_id, tag_id')
          .in('snippet_id', snippetIds);

        if (snippetTagsError) throw snippetTagsError;
        snippetTagsData = data || [];
      }

      const bookmarkMap = new Map(
        (bookmarksData || []).map(b => [b.snippet_id, b])
      );

      // Create tag lookup map
      const tagMap = new Map(
        (tagsData || []).map(t => [t.id, { id: t.id, userId: t.user_id, name: t.name, colorHex: t.color_hex, createdAt: t.created_at }])
      );

      // Create snippet-to-tags map
      const snippetTagsMap = new Map<string, Tag[]>();
      snippetTagsData.forEach(st => {
        const tag = tagMap.get(st.tag_id);
        if (tag) {
          const existing = snippetTagsMap.get(st.snippet_id) || [];
          existing.push(tag);
          snippetTagsMap.set(st.snippet_id, existing);
        }
      });

      const enrichedSnippets: CodeSnippet[] = (snippetsData || []).map(s => ({
        id: s.id,
        messageId: s.message_id,
        conversationId: s.conversation_id,
        userId: s.user_id,
        language: s.language,
        content: s.content,
        contentHash: s.content_hash ? bytesToHex(s.content_hash) : undefined,
        lineCount: s.line_count,
        orderIndex: s.order_index,
        userDefinedName: s.user_defined_name,
        detectedFileName: detectFileType(s.content, s.language) || undefined,
        isBookmarked: bookmarkMap.has(s.id),
        tags: snippetTagsMap.get(s.id) || [],
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));

      setSnippets(enrichedSnippets);
      setBookmarks((bookmarksData || []).map(b => ({
        id: b.id,
        snippetId: b.snippet_id,
        folderPath: b.folder_path,
        notes: b.notes,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })));
      setTags(Array.from(tagMap.values()));

      // Mark messages as extracted
      enrichedSnippets.forEach(s => {
        extractedMessagesRef.current.add(s.messageId);
      });
    } catch (error) {
      console.error('Error fetching snippets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, userId]);

  // Extract snippets from messages
  const extractSnippetsFromMessages = useCallback(async () => {
    if (!sessionId || !userId || messages.length === 0) return;

    setIsExtracting(true);
    try {
      // Get conversation ID
      const { data: conversation } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (!conversation) return;

      const newSnippets: CodeSnippet[] = [];

      // Process only assistant messages that haven't been extracted yet
      for (const message of messages) {
        if (message.role !== 'assistant') continue;
        
        // 1. Skip if we already extracted from this message ID
        if (extractedMessagesRef.current.has(message.id)) continue;

        // 2. CRITICAL FIX: Skip if the message ID is not a valid UUID (e.g. "2153" or optimistic IDs)
        if (!isValidUUID(message.id)) {
          // Optional: console.log('Skipping snippet extraction for invalid UUID:', message.id);
          continue;
        }

        const blocks = extractCodeBlocks(message.content);

        if (blocks.length > 0) {
          // Insert all blocks for this message
          for (const block of blocks) {
            const detectedName = detectFileType(block.content, block.language);

            const { data: inserted, error } = await supabase
              .from('code_snippets')
              .insert({
                message_id: message.id,
                conversation_id: conversation.id,
                user_id: userId,
                language: block.language,
                content: block.content,
                line_count: block.lineCount,
                order_index: block.orderIndex,
                user_defined_name: detectedName || undefined,
              })
              .select()
              .single();

            if (error) {
              console.error('Error inserting snippet:', error);
              continue;
            }

            if (inserted) {
              newSnippets.push({
                id: inserted.id,
                messageId: inserted.message_id,
                conversationId: inserted.conversation_id,
                userId: inserted.user_id,
                language: inserted.language,
                content: inserted.content,
                contentHash: inserted.content_hash ? bytesToHex(inserted.content_hash) : undefined,
                lineCount: inserted.line_count,
                orderIndex: inserted.order_index,
                userDefinedName: inserted.user_defined_name,
                detectedFileName: detectFileType(inserted.content, inserted.language) || undefined,
                isBookmarked: false,
                tags: [],
                createdAt: inserted.created_at,
                updatedAt: inserted.updated_at,
              });
            }
          }

          extractedMessagesRef.current.add(message.id);
        }
      }

      if (newSnippets.length > 0) {
        setSnippets(prev => [...prev, ...newSnippets]);
      }
    } catch (error) {
      console.error('Error extracting snippets:', error);
    } finally {
      setIsExtracting(false);
    }
  }, [sessionId, userId, messages]);

  // Toggle bookmark
  const toggleBookmark = useCallback(async (snippetId: string) => {
    if (!userId) return;

    const snippet = snippets.find(s => s.id === snippetId);
    if (!snippet) return;

    try {
      if (snippet.isBookmarked) {
        // Remove bookmark
        const bookmark = bookmarks.find(b => b.snippetId === snippetId);
        if (bookmark) {
          const { error } = await supabase
            .from('snippet_bookmarks')
            .delete()
            .eq('id', bookmark.id);

          if (error) throw error;

          setBookmarks(prev => prev.filter(b => b.id !== bookmark.id));
          setSnippets(prev => prev.map(s =>
            s.id === snippetId ? { ...s, isBookmarked: false } : s
          ));
        }
      } else {
        // Add bookmark
        const { data, error } = await supabase
          .from('snippet_bookmarks')
          .insert({
            snippet_id: snippetId,
            user_id: userId,
          })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          setBookmarks(prev => [...prev, {
            id: data.id,
            snippetId: data.snippet_id,
            folderPath: data.folder_path,
            notes: data.notes,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          }]);
          setSnippets(prev => prev.map(s =>
            s.id === snippetId ? { ...s, isBookmarked: true } : s
          ));
        }
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  }, [userId, snippets, bookmarks]);

  // Update snippet name
  const updateSnippetName = useCallback(async (snippetId: string, name: string) => {
    try {
      const { error } = await supabase
        .from('code_snippets')
        .update({ user_defined_name: name })
        .eq('id', snippetId);

      if (error) throw error;

      setSnippets(prev => prev.map(s =>
        s.id === snippetId ? { ...s, userDefinedName: name } : s
      ));
    } catch (error) {
      console.error('Error updating snippet name:', error);
    }
  }, []);

  // Delete snippet
  const deleteSnippet = useCallback(async (snippetId: string) => {
    try {
      const { error } = await supabase
        .from('code_snippets')
        .delete()
        .eq('id', snippetId);

      if (error) throw error;

      setSnippets(prev => prev.filter(s => s.id !== snippetId));
    } catch (error) {
      console.error('Error deleting snippet:', error);
    }
  }, []);

  // Create a new tag
  const createTag = useCallback(async (name: string, colorHex?: string): Promise<Tag | null> => {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({
          user_id: userId,
          name,
          color_hex: colorHex,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newTag: Tag = {
          id: data.id,
          userId: data.user_id,
          name: data.name,
          colorHex: data.color_hex,
          createdAt: data.created_at,
        };
        setTags(prev => [...prev, newTag]);
        return newTag;
      }
    } catch (error) {
      console.error('Error creating tag:', error);
    }
    return null;
  }, [userId]);

  // Delete a tag
  const deleteTag = useCallback(async (tagId: string) => {
    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      setTags(prev => prev.filter(t => t.id !== tagId));
      // Remove tag from all snippets
      setSnippets(prev => prev.map(s => ({
        ...s,
        tags: s.tags.filter(t => t.id !== tagId),
      })));
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  }, []);

  // Add tag to snippet
  const addTagToSnippet = useCallback(async (snippetId: string, tagId: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('snippet_tags')
        .insert({
          snippet_id: snippetId,
          tag_id: tagId,
          user_id: userId,
        });

      if (error) throw error;

      const tag = tags.find(t => t.id === tagId);
      if (tag) {
        setSnippets(prev => prev.map(s =>
          s.id === snippetId ? { ...s, tags: [...s.tags, tag] } : s
        ));
      }
    } catch (error) {
      console.error('Error adding tag to snippet:', error);
    }
  }, [userId, tags]);

  // Remove tag from snippet
  const removeTagFromSnippet = useCallback(async (snippetId: string, tagId: string) => {
    try {
      const { error } = await supabase
        .from('snippet_tags')
        .delete()
        .eq('snippet_id', snippetId)
        .eq('tag_id', tagId);

      if (error) throw error;

      setSnippets(prev => prev.map(s =>
        s.id === snippetId ? { ...s, tags: s.tags.filter(t => t.id !== tagId) } : s
      ));
    } catch (error) {
      console.error('Error removing tag from snippet:', error);
    }
  }, []);

  // Update bookmark folder path
  const updateBookmarkFolder = useCallback(async (bookmarkId: string, folderPath: string) => {
    try {
      const { error } = await supabase
        .from('snippet_bookmarks')
        .update({ folder_path: folderPath })
        .eq('id', bookmarkId);

      if (error) throw error;

      setBookmarks(prev => prev.map(b =>
        b.id === bookmarkId ? { ...b, folderPath } : b
      ));
    } catch (error) {
      console.error('Error updating bookmark folder:', error);
    }
  }, []);

  // Update bookmark notes
  const updateBookmarkNotes = useCallback(async (bookmarkId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('snippet_bookmarks')
        .update({ notes })
        .eq('id', bookmarkId);

      if (error) throw error;

      setBookmarks(prev => prev.map(b =>
        b.id === bookmarkId ? { ...b, notes } : b
      ));
    } catch (error) {
      console.error('Error updating bookmark notes:', error);
    }
  }, []);

  // Load snippets on mount and session change
  useEffect(() => {
    extractedMessagesRef.current.clear();
    fetchSnippets();
  }, [fetchSnippets]);

  // Extract snippets when messages change
  useEffect(() => {
    if (messages.length > 0) {
      extractSnippetsFromMessages();
    }
  }, [messages, extractSnippetsFromMessages]);

  return {
    snippets,
    bookmarks,
    tags,
    isLoading,
    isExtracting,
    toggleBookmark,
    updateSnippetName,
    deleteSnippet,
    createTag,
    deleteTag,
    addTagToSnippet,
    removeTagFromSnippet,
    updateBookmarkFolder,
    updateBookmarkNotes,
    refreshSnippets: fetchSnippets,
  };
};