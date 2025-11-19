import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChatTurn, GroundingMetadata, Attachment, historyService } from '../services/historyService';
import { Config, getAuthHeaders } from '../lib/supabaseClient';
import { processNdjsonStream } from '../utils/streamUtils';

export const useChatSession = (
    sessionId: string,
    selectedModel: string = 'auto',
    explicitProviderHint: 'gemini' | 'claude' | null = null
) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [currentResponse, setCurrentResponse] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);

    const providerHint = useMemo(() => {
        return explicitProviderHint || (selectedModel === 'auto' ? null : selectedModel);
    }, [explicitProviderHint, selectedModel]);

    useEffect(() => {
        const loadHistory = async () => {
            if (!sessionId) return;

            setIsInitialized(false);
            setChatHistory([]);
            setCurrentResponse('');
            setIsLoading(false);

            try {
                const history = await historyService.getSession(sessionId);
                setChatHistory(history);
            } catch (e) {
                console.error("Failed to load history for session:", sessionId, e);
            } finally {
                setIsInitialized(true);
            }
        };

        loadHistory();
    }, [sessionId]);

    const sendMessage = useCallback(async (message: string, attachment?: Attachment) => {
        if (isLoading) {
            console.warn("Message already in progress.");
            return;
        }
        if (!message.trim() && !attachment) {
            return;
        }
        if (!Config.EDGE_FUNCTION_URL) {
            console.error("Cannot send message, Edge Function URL is missing.");
            return;
        }

        setIsLoading(true);
        setCurrentResponse('');

        const userTurn: ChatTurn = {
            id: crypto.randomUUID(),
            role: 'user',
            text: message,
            timestamp: new Date(),
            attachment: attachment
        };
        setChatHistory(prev => [...prev, userTurn]);

        try {
            const headers = await getAuthHeaders();

            const response = await fetch(Config.EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    sessionId,
                    userMessage: message,
                    attachment: attachment,
                    providerHint: providerHint,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => response.statusText);
                throw new Error(`API error: ${response.status} - ${errorBody}`);
            }

            let fullText = '';
            let finalGroundingMetadata: GroundingMetadata | undefined;

            await processNdjsonStream(response, (event) => {
                switch (event.type) {
                    case 'text':
                        fullText += event.content;
                        setCurrentResponse(fullText);
                        break;
                    case 'metadata':
                        if (event.content?.grounding) {
                            finalGroundingMetadata = event.content.grounding;
                        }
                        break;
                    case 'model_switch':
                        console.log("[Model Switch]:", event.model, event.content);
                        break;
                    case 'progress':
                        console.log("[Progress]:", event.progress, event.step);
                        break;
                    case 'usage':
                        console.log("[Token Usage]:", event.metadata);
                        break;
                    case 'done':
                        break;
                    case 'log':
                        console.log("[AI Router Log]:", event.content);
                        break;
                    case 'error':
                        throw new Error(event.content);
                }
            });

            const modelTurn: ChatTurn = {
                id: crypto.randomUUID(),
                role: 'model',
                text: fullText.trim(),
                timestamp: new Date(),
                groundingMetadata: finalGroundingMetadata,
            };

            if (modelTurn.text.length > 0 || finalGroundingMetadata) {
                setChatHistory(prev => [...prev, modelTurn]);
            }

        } catch (error: any) {
            console.error("Error during sendMessage:", error);
            const errorMessage = error.message || "An unknown error occurred.";
            const errorTurn: ChatTurn = {
                id: crypto.randomUUID(),
                role: 'model',
                text: `Error: ${errorMessage}`,
                timestamp: new Date(),
            };
            setChatHistory(prev => [...prev, errorTurn]);
        } finally {
            setIsLoading(false);
            setCurrentResponse('');
        }
    }, [sessionId, providerHint]);

    return {
        sendMessage,
        isLoading,
        currentResponse,
        chatHistory,
        isInitialized,
    };
};
