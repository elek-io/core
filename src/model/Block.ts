import AbstractModelWithLanguage from './AbstractModelWithLanguage';

/**
 * The block represents some kind of Markdown content inside a page.
 * It needs a position inside the pages layout to be injected in
 */
export default class Block extends AbstractModelWithLanguage {
  public body = '';

  constructor(id: string, language: string, body: string) {
    super(id, language, 'block');

    this.body = body;
  }
}