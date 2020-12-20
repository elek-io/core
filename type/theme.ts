import { BlockRestrictions } from './block';

export type ThemeLayoutType = 'main' | 'page';

export interface ThemeLayout {
  id: string;
  type: ThemeLayoutType;
  name: string;
  description: string;
  path: string;
}

export interface ThemeLayoutBlockPosition {
  id: string;
  restrictions: BlockRestrictions;
}