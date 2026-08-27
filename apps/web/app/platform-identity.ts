export type PlatformIdentity = Readonly<{
  userId: string;
  email: string;
  fullName: string | null;
  displayName: string;
}>;

export const PLATFORM_IDENTITY_HEADERS = Object.freeze({
  userId: 'oai-authenticated-user-id',
  email: 'oai-authenticated-user-email',
  fullName: 'oai-authenticated-user-full-name',
  fullNameEncoding: 'oai-authenticated-user-full-name-encoding',
});

const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';

export function readPlatformIdentity(headers: Pick<Headers, 'get'>): PlatformIdentity | null {
  const userId = headers.get(PLATFORM_IDENTITY_HEADERS.userId);
  const email = headers.get(PLATFORM_IDENTITY_HEADERS.email);
  if (!userId || !email) return null;

  const encodedFullName = headers.get(PLATFORM_IDENTITY_HEADERS.fullName);
  const fullName = encodedFullName
    && headers.get(PLATFORM_IDENTITY_HEADERS.fullNameEncoding) === PERCENT_ENCODED_UTF8
    ? safeDecodeURIComponent(encodedFullName)
    : null;
  return Object.freeze({ userId, email, fullName, displayName: fullName ?? email });
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
