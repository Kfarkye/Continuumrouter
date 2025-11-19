import Ajv from "npm:ajv@8.12.0";

const ajv = new Ajv({ strict: true, allErrors: true });

export function validateJson(data: unknown, schema: Record<string, unknown>, label: string): void {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ") || "unknown";
    throw new Error(`${label}_schema_mismatch: ${errors}`);
  }
}

export function safeJsonParse<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}