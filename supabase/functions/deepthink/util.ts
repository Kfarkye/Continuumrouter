export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  return crypto.subtle.digest("SHA-256", dataBuffer).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export function logError(context: string, error: unknown): void {
  console.error(`[DeepThink Error] ${context}:`, error);
}

export function logInfo(context: string, message: string, data?: Record<string, unknown>): void {
  console.log(`[DeepThink] ${context}: ${message}`, data ? JSON.stringify(data) : "");
}