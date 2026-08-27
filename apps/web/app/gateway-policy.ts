export function parseApiBaseUrl(rawValue: string | undefined, requireHttps: boolean): URL {
  if (!rawValue) throw new Error('LEDGERLY_API_BASE_URL is required.');
  let value: URL;
  try {
    value = new URL(rawValue);
  } catch {
    throw new Error('LEDGERLY_API_BASE_URL must be an absolute HTTP URL.');
  }
  if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.search || value.hash) {
    throw new Error('LEDGERLY_API_BASE_URL must be a credential-free HTTP origin or path.');
  }
  if (requireHttps && value.protocol !== 'https:') {
    throw new Error('LEDGERLY_API_BASE_URL must use HTTPS in production.');
  }
  value.pathname = `${value.pathname.replace(/\/+$/u, '')}/`;
  return value;
}

export function expectedApplicationOrigin(
  configuredOrigin: string | undefined,
  requestUrl: string,
  explicitLocalDevelopment: boolean,
): string | null {
  if (!configuredOrigin && explicitLocalDevelopment) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      return null;
    }
  }
  if (!configuredOrigin) return null;
  try {
    const url = new URL(configuredOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' || url.origin !== configuredOrigin.replace(/\/$/u, '')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function runtimeSessionCookieName(production: boolean): string {
  return production ? '__Host-ledgerly_session' : 'ledgerly_session';
}

export function isJsonMediaType(value: string | null, allowStructuredSuffix: boolean): boolean {
  if (!value) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType === 'application/json' || mediaType === 'application/problem+json') return true;
  return allowStructuredSuffix && mediaType?.startsWith('application/') === true && mediaType.endsWith('+json');
}

export function isOpaqueSessionToken(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 256) return false;
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint >= 0x21 && codePoint <= 0x7e;
  });
}
