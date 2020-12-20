/**
 * Represents some supported markdown-it rules
 * @see https://github.com/markdown-it/markdown-it#manage-rules
 */
export enum BlockRuleEnum {
  'heading',
  'table',
  'code',
  'blockquote',
  'hr',
  'list',
  'paragraph',
  'strikethrough',
  'emphasis',
  'link',
  'image'
}
export const BlockRuleArray = <BlockRule[]>Object.keys(BlockRuleEnum).filter((key) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof BlockRuleEnum[key as any] === 'number';
});
export type BlockRule = keyof typeof BlockRuleEnum;

export interface BlockRestrictions {
  only: BlockRule[];
  not: BlockRule[];
  minimum: number;
  maximum: number;
  required: boolean;
  inline: boolean;
  breaks: boolean;
  html: boolean;
  highlightCode: boolean;
  repeatable: boolean;
}