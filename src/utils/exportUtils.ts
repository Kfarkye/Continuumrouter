import { AiMessage } from '../types';

export interface ExportMetadata {
  title: string;
  exportDate: string;
  messageCount: number;
  format: 'markdown' | 'json';
}

export function generateFilename(conversationTitle: string, format: 'markdown' | 'json'): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const sanitized = conversationTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${sanitized}-${timestamp}.${format === 'markdown' ? 'md' : 'json'}`;
}

export function getFileSizeEstimate(content: string): number {
  return new Blob([content]).size;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportToMarkdown(messages: AiMessage[], metadata: ExportMetadata): string {
  let markdown = `# ${metadata.title}\n\n`;
  markdown += `**Exported:** ${new Date(metadata.exportDate).toLocaleString()}\n`;
  markdown += `**Messages:** ${metadata.messageCount}\n\n`;
  markdown += `---\n\n`;

  messages.forEach((message, index) => {
    const role = message.role === 'user' ? 'User' : 'Assistant';
    const timestamp = new Date(message.created_at).toLocaleString();

    markdown += `## ${role} - ${timestamp}\n\n`;
    markdown += `${message.content}\n\n`;

    if (message.model) {
      markdown += `*Model: ${message.model}*\n\n`;
    }

    if (index < messages.length - 1) {
      markdown += `---\n\n`;
    }
  });

  return markdown;
}

function exportToJSON(messages: AiMessage[], metadata: ExportMetadata): string {
  const exportData = {
    metadata,
    messages: messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      model: msg.model || null,
      created_at: msg.created_at,
      conversation_id: msg.conversation_id,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

export async function exportWithWorker(
  messages: AiMessage[],
  metadata: ExportMetadata,
  format: 'markdown' | 'json',
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve) => {
    onProgress?.(0);

    setTimeout(() => {
      onProgress?.(30);

      const content = format === 'markdown'
        ? exportToMarkdown(messages, metadata)
        : exportToJSON(messages, metadata);

      setTimeout(() => {
        onProgress?.(70);

        setTimeout(() => {
          onProgress?.(100);
          resolve(content);
        }, 100);
      }, 100);
    }, 100);
  });
}
