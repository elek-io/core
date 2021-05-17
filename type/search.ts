import { ModelType } from './model';

export interface SearchOptions {
  caseSensitive: boolean;
}

export interface SearchResultExcerpt {
  key: string;
  prefix: string;
  match: string;
  suffix: string;
}

export interface SearchResult {
  id: string;
  language: string;
  name: string;
  type: ModelType;
  matches: SearchResultExcerpt[];
}