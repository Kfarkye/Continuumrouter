export interface AnalyticsEvent {
  eventName: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  const event: AnalyticsEvent = {
    eventName,
    properties,
    timestamp: new Date().toISOString(),
  };

  console.log('[Analytics]', event);
}

export function trackCopy(codeLength: number, language?: string): void {
  trackEvent('code_copy', {
    codeLength,
    language,
  });
}

export function trackExport(
  format: 'markdown' | 'json',
  messageCount: number,
  fileSize: number,
  duration: number,
  isLarge: boolean
): void {
  trackEvent('conversation_export', {
    format,
    messageCount,
    fileSize,
    duration,
    isLarge,
  });
}

export function trackContextSave(
  characterCount: number,
  tokenEstimate: number,
  isActive: boolean
): void {
  trackEvent('context_save', {
    characterCount,
    tokenEstimate,
    isActive,
  });
}

export function trackContextToggle(isActive: boolean): void {
  trackEvent('context_toggle', {
    isActive,
  });
}
