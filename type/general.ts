/**
 * Defines that one or more keys (K) of type (T) are optional
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

/**
 * Custom JSON type to be more specific about what we expect
 * and do not need to use the any type that would generate warnings
 * 
 * @see https://github.com/microsoft/TypeScript/issues/1897#issuecomment-580962081
 */
export type Json = | null | boolean | number | string | Json[] | { [prop: string]: Json };

/**
 * Since we read and write a lot of JSON,
 * we want to be more specific about what we are currently working with.
 * 
 * For example:
 * If we instanciate a new page, e.g. new Page(xyz), we are able to call methods of this class.
 * If we then save (serialize) this class as JSON on disk and after that read (parse) it again,
 * we are not able to call methods of the class since we are now working
 * with a plain (literal) object that only has the same properties of the class before.
 * 
 * This type is showing us exactly that we are only working with the JSON representation
 * of the class, not the class itself. Which is also way better then working
 * with the default any type JSON.parse() is returning.
 * 
 * @see https://github.com/microsoft/TypeScript/issues/1897#issuecomment-580962081
 */
export type JsonOf<T> = {
  [P in keyof T]: T[P] extends Json
    ? T[P]
    : Pick<T, P> extends Required<Pick<T, P>>
    ? never
    : T[P] extends (() => any) | undefined
    ? never
    : JsonOf<T[P]>;
};

/**
 * Options that can be passed to elek.io core
 */
export interface ElekIoCoreOptions {
  signature: GitSignature;
  theme: {
    htmlPrefix: string;
  };
  file: {
    md: {
      delimiter: string;
    };
  };
  log: {
    fileName: string;
  };
}

/**
 * Signature git uses to identify users
 */
export interface GitSignature {
  name: string;
  email: string;
}