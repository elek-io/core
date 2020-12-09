/**
 * Defines that one or more keys (K) of type (T) are optional
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

/**
 * Options that can be passed to elek.io core
 */
export type ElekIoCoreOptions = {
  signature: GitSignature;
}

/**
 * Signature git uses to identify users
 */
export type GitSignature = {
  name: string;
  email: string;
}