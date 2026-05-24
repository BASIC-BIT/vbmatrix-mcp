export interface TextContent {
  type: 'text';
  text: string;
}

export function textContent(text: string): TextContent[] {
  return [{ type: 'text', text }];
}

export function jsonResponse(payload: Record<string, unknown>) {
  return {
    content: textContent(JSON.stringify(payload, null, 2)),
    structuredContent: payload,
  };
}

export function toolError(message: string, payload?: Record<string, unknown>) {
  const body = payload ?? { error: message };
  return {
    isError: true,
    content: textContent(JSON.stringify(body, null, 2)),
    structuredContent: body,
  };
}
