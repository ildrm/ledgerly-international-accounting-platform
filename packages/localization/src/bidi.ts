import type { TextDirection, UiLocale } from "./locale-registry.js";
import { getTextDirection } from "./locale-registry.js";

export type DetectedTextDirection = TextDirection | "auto";

export const BIDI_ISOLATES = Object.freeze({
  ltr: "\u2066",
  rtl: "\u2067",
  auto: "\u2068",
  end: "\u2069",
});

const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/gu;
const UNSAFE_IDENTIFIER_CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;
const ANY_LETTER = /\p{Letter}/u;
const RTL_SCRIPT_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;

export function detectTextDirection(value: string): DetectedTextDirection {
  for (const character of value) {
    if (ANY_LETTER.test(character)) {
      return RTL_SCRIPT_LETTER.test(character) ? "rtl" : "ltr";
    }
  }
  return "auto";
}

export function isolateBidi(
  value: string,
  direction: DetectedTextDirection = "auto",
): string {
  if (containsBidiControls(value)) {
    throw new RangeError("Text to isolate contains bidi control characters");
  }
  const opening = BIDI_ISOLATES[direction];
  return `${opening}${value}${BIDI_ISOLATES.end}`;
}

export function stripBidiControls(value: string): string {
  return value.replace(BIDI_CONTROL_PATTERN, "");
}

export function containsBidiControls(value: string): boolean {
  BIDI_CONTROL_PATTERN.lastIndex = 0;
  return BIDI_CONTROL_PATTERN.test(value);
}

export function assertSafeIdentifier(value: string): string {
  if (value.length === 0) {
    throw new RangeError("Identifier cannot be empty");
  }
  if (UNSAFE_IDENTIFIER_CONTROL_PATTERN.test(value)) {
    throw new RangeError("Identifier contains invisible or directional control characters");
  }
  return value;
}

export function getBidiAttributes(
  value: string,
  fallbackLocale?: UiLocale,
): Readonly<{ dir: DetectedTextDirection }> {
  const detected = detectTextDirection(value);
  return {
    dir: detected === "auto" && fallbackLocale !== undefined ? getTextDirection(fallbackLocale) : detected,
  };
}
