export type DomainErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'business_rule';

export class DomainError extends Error {
  constructor(
    public readonly kind: DomainErrorKind,
    public readonly code: string,
    public readonly parameters: Readonly<Record<string, string | number | boolean>> = {},
    public readonly fieldErrors: readonly { path: string; code: string; parameters?: Readonly<Record<string, string | number | boolean>> }[] = [],
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
