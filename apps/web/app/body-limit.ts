export async function readBoundedUtf8Body(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maximumBytes: number,
): Promise<string | undefined> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) return undefined;
  if (declaredLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength)) return undefined;
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > maximumBytes) return undefined;
  }
  if (!body) return '';

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      totalBytes += item.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel('BODY_TOO_LARGE');
        return undefined;
      }
      text += decoder.decode(item.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    await reader.cancel('INVALID_UTF8_BODY').catch(() => undefined);
    return undefined;
  } finally {
    reader.releaseLock();
  }
}
