import { GroundingMetadata } from '../services/historyService';

export type StreamEvent =
    | { type: 'text'; content: string }
    | { type: 'metadata'; content: { grounding?: GroundingMetadata; [key: string]: any } }
    | { type: 'error'; content: string }
    | { type: 'log'; content: any }
    | { type: 'model_switch'; model: string; content?: string; metadata?: Record<string, any> }
    | { type: 'progress'; progress: number; step: string }
    | { type: 'usage'; model: string; metadata?: Record<string, any> }
    | { type: 'done' };

export async function processNdjsonStream(
    response: Response,
    onChunk: (event: StreamEvent) => void
): Promise<void> {
    if (!response.body) {
        throw new Error("Response body is missing or not readable.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith(':')) continue;

            let jsonString = trimmed;
            if (trimmed.startsWith('data:')) {
                jsonString = trimmed.slice(5).trim();
            }

            if (jsonString === '[DONE]' || jsonString === 'DONE') continue;

            try {
                const parsed = JSON.parse(jsonString) as StreamEvent;
                if (parsed.type) {
                    onChunk(parsed);
                }
            } catch (e) {
                console.error("Error parsing stream chunk (skipping line):", e, line);
            }
        }
    }

    if (buffer.trim() !== '') {
        const trimmed = buffer.trim();
        if (!trimmed.startsWith(':')) {
            let jsonString = trimmed;
            if (trimmed.startsWith('data:')) {
                jsonString = trimmed.slice(5).trim();
            }

            try {
                const parsed = JSON.parse(jsonString) as StreamEvent;
                if (parsed.type) {
                    onChunk(parsed);
                }
            } catch (e) {
                console.error("Error parsing final stream buffer:", e, buffer);
            }
        }
    }
}
