import { Locale } from './general';

export type ProjectStatus = 'todo' | 'foo' | 'bar';

export interface ProjectSettings {
  locale: {
    default: Locale;
    supported: Locale[];
  };
}