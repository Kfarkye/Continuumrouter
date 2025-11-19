import { Download, Eye, Star, FileText } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface ExtractedSchema {
  id: string;
  name: string;
  format: string;
  storagePath: string;
  fileSize: number;
  extractedAt: string;
  isFavorite: boolean;
  description?: string;
  source_file?: string;
  tags?: string[];
}

interface ExtractedSchemaCardProps {
  schema: ExtractedSchema;
  onPreview: (content: string, format: string) => void;
  onFavoriteToggle: (id: string, isFavorite: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function ExtractedSchemaCard({ schema, onPreview, onFavoriteToggle }: ExtractedSchemaCardProps) {
  const handleDownload = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('schemas')
        .download(schema.storagePath);

      if (error) throw error;

      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = schema.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download schema:', error);
    }
  };

  const handlePreview = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('schemas')
        .download(schema.storagePath);

      if (error) throw error;

      if (data) {
        const content = await data.text();
        onPreview(content, schema.format);
      }
    } catch (error) {
      console.error('Failed to preview schema:', error);
    }
  };

  const handleFavoriteToggle = () => {
    onFavoriteToggle(schema.id, !schema.isFavorite);
  };

  return (
    <div className="schema-card">
      <div className="schema-header">
        <span className="schema-format-badge">{schema.format}</span>
        <h3>{schema.name}</h3>
      </div>

      {schema.description && (
        <p className="schema-description">
          {schema.description}
        </p>
      )}

      <div className="schema-meta">
        <span>{formatFileSize(schema.fileSize)}</span>
        <span>{formatDate(schema.extractedAt)}</span>
        {schema.source_file && (
          <span className="schema-source" title={`Source: ${schema.source_file}`}>
            <FileText size={14} style={{ display: 'inline', marginRight: '4px' }} />
            {schema.source_file.length > 20
              ? `${schema.source_file.substring(0, 20)}...`
              : schema.source_file
            }
          </span>
        )}
      </div>

      {schema.tags && schema.tags.length > 0 && (
        <div className="schema-tags">
          {schema.tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="schema-tag">{tag}</span>
          ))}
          {schema.tags.length > 3 && (
            <span className="schema-tag-more">+{schema.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="schema-actions">
        <button onClick={handlePreview} title="Preview" className="schema-action-btn">
          <Eye size={16} />
        </button>
        <button onClick={handleDownload} title="Download" className="schema-action-btn">
          <Download size={16} />
        </button>
        <button onClick={handleFavoriteToggle} title="Favorite" className="schema-action-btn">
          <Star size={16} fill={schema.isFavorite ? 'gold' : 'none'} />
        </button>
      </div>
    </div>
  );
}
