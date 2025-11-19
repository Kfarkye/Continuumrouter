import { useState, useCallback } from 'react';
import { SavedSchema } from '../types';
import { supabase } from './supabaseClient';

export type StorageMode = 'local' | 'cloud' | 'hybrid';

interface StorageAdapterConfig {
  mode: StorageMode;
  localStoragePrefix?: string;
}

interface QueryOptions {
  search?: string;
  limit?: number;
}

interface StorageStats {
  count: number;
  totalSize: number;
  mode: StorageMode;
}

class StorageAdapter {
  private mode: StorageMode;
  private prefix: string;

  constructor(config: StorageAdapterConfig) {
    this.mode = config.mode;
    this.prefix = config.localStoragePrefix || 'storage_';
  }

  async getSchemas(sessionId: string, options: QueryOptions = {}): Promise<SavedSchema[]> {
    if (this.mode === 'local') {
      return this.getLocalSchemas(sessionId, options);
    } else {
      return this.getCloudSchemas(sessionId, options);
    }
  }

  private getLocalSchemas(sessionId: string, options: QueryOptions): SavedSchema[] {
    try {
      const key = `${this.prefix}${sessionId}`;
      const stored = localStorage.getItem(key);
      if (!stored) return [];

      let schemas: SavedSchema[] = JSON.parse(stored);

      if (options.search) {
        const query = options.search.toLowerCase();
        schemas = schemas.filter(s =>
          s.name.toLowerCase().includes(query) ||
          JSON.stringify(s.content).toLowerCase().includes(query)
        );
      }

      if (options.limit) {
        schemas = schemas.slice(0, options.limit);
      }

      return schemas;
    } catch (error) {
      console.error('Error getting local schemas:', error);
      return [];
    }
  }

  private async getCloudSchemas(sessionId: string, options: QueryOptions): Promise<SavedSchema[]> {
    try {
      let query = supabase
        .from('stored_schemas')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (options.search) {
        query = query.ilike('name', `%${options.search}%`);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting cloud schemas:', error);
      return [];
    }
  }

  async saveSchema(sessionId: string, name: string, content: any, type?: string): Promise<SavedSchema> {
    const schema: SavedSchema = {
      id: crypto.randomUUID(),
      name,
      content: typeof content === 'string' ? { code: content, type: type || 'unknown' } : content,
      session_id: sessionId,
      created_at: new Date().toISOString(),
      user_id: '',
    };

    if (this.mode === 'local') {
      const key = `${this.prefix}${sessionId}`;
      const stored = localStorage.getItem(key);
      const schemas: SavedSchema[] = stored ? JSON.parse(stored) : [];
      schemas.push(schema);
      localStorage.setItem(key, JSON.stringify(schemas));
      return schema;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: currentProject } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await supabase
        .from('saved_schemas')
        .insert({
          user_id: user.id,
          session_id: sessionId,
          project_id: currentProject?.id || null,
          name,
          content: typeof content === 'string' ? { code: content, type: type || 'unknown' } : content,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SavedSchema;
    }
  }

  async deleteSchema(id: string, sessionId: string): Promise<void> {
    if (this.mode === 'local') {
      const key = `${this.prefix}${sessionId}`;
      const stored = localStorage.getItem(key);
      if (!stored) return;

      const schemas: SavedSchema[] = JSON.parse(stored);
      const filtered = schemas.filter(s => s.id !== id);
      localStorage.setItem(key, JSON.stringify(filtered));
    } else {
      const { error } = await supabase
        .from('stored_schemas')
        .delete()
        .eq('id', id);

      if (error) throw error;
    }
  }

  async exportSchemas(sessionId: string): Promise<Blob> {
    const schemas = await this.getSchemas(sessionId);
    const json = JSON.stringify(schemas, null, 2);
    return new Blob([json], { type: 'application/json' });
  }

  async importSchemas(sessionId: string, file: File): Promise<number> {
    const text = await file.text();
    const schemas: SavedSchema[] = JSON.parse(text);

    if (this.mode === 'local') {
      const key = `${this.prefix}${sessionId}`;
      const existing = this.getLocalSchemas(sessionId, {});
      const combined = [...existing, ...schemas];
      localStorage.setItem(key, JSON.stringify(combined));
    } else {
      const schemasToInsert = schemas.map(s => ({
        ...s,
        session_id: sessionId,
      }));

      const { error } = await supabase
        .from('stored_schemas')
        .insert(schemasToInsert);

      if (error) throw error;
    }

    return schemas.length;
  }

  getStorageStats(sessionId: string): StorageStats {
    const schemas = this.mode === 'local'
      ? this.getLocalSchemas(sessionId, {})
      : [];

    const totalSize = schemas.reduce((acc, s) => {
      return acc + new Blob([JSON.stringify(s.content)]).size;
    }, 0);

    return {
      count: schemas.length,
      totalSize,
      mode: this.mode,
    };
  }
}

export function useStorageAdapter(config: StorageAdapterConfig) {
  const [adapter] = useState(() => new StorageAdapter(config));

  return { adapter };
}
