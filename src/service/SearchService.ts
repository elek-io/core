import type { Asset } from '../schema/assetSchema.js';
import type { ObjectType, SupportedLanguage } from '../schema/baseSchema.js';
import type { Collection } from '../schema/collectionSchema.js';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import type { SearchResult } from '../schema/searchSchema.js';
import {
  serviceTypeSchema,
  type PaginatedList,
} from '../schema/serviceSchema.js';
import AbstractCrudService from './AbstractCrudService.js';
import AssetService from './AssetService.js';
import CollectionService from './CollectionService.js';

/**
 * Service that queries other services for data to search
 *
 * @todo refactor for the new Services
 */
export default class SearchService extends AbstractCrudService {
  private assetService: AssetService;
  private collectionService: CollectionService;

  constructor(
    options: ElekIoCoreOptions,
    assetService: AssetService,
    collectionService: CollectionService
  ) {
    super(serviceTypeSchema.enum.Search, options);

    this.assetService = assetService;
    this.collectionService = collectionService;
  }

  /**
   * Search all models inside the project for given query
   *
   * @todo Implement SearchOptions parameter
   *
   * @param project Project to search in
   * @param query Query to search for
   */
  public async search(
    projectId: string,
    query: string,
    language: SupportedLanguage,
    objectTypes?: ObjectType[]
  ) {
    const paginatedListPromises: Promise<PaginatedList<Asset | Collection>>[] =
      [];
    const normalizedQuery = query.trim();

    if (normalizedQuery === '') {
      return [];
    }

    if (objectTypes && objectTypes.length !== 0) {
      for (let index = 0; index < objectTypes.length; index++) {
        const objectType = objectTypes[index];

        switch (objectType) {
          case 'asset':
            paginatedListPromises.push(
              this.assetService.list({ projectId, filter: query })
            );
            break;
          case 'collection':
            paginatedListPromises.push(
              this.collectionService.list({ projectId, filter: query })
            );
            break;
        }
      }
    } else {
      paginatedListPromises.push(
        this.assetService.list({ projectId, filter: query })
      );
      paginatedListPromises.push(
        this.collectionService.list({ projectId, filter: query })
      );
    }

    const paginatedLists = (await Promise.all(paginatedListPromises)).flat();

    return paginatedLists.map((paginatedList) => {
      return paginatedList.list.flat().map((file) => {
        switch (file.objectType) {
          case 'asset': {
            const result: SearchResult = {
              id: file.id,
              language: file.language,
              objectType: file.objectType,
              name: file.name,
              matches: this.match(
                file,
                ['name', 'description', 'mimeType', 'extension'],
                normalizedQuery
              ),
            };
            return result;
          }
          case 'collection': {
            const result: SearchResult = {
              id: file.id,
              objectType: file.objectType,
              name: file.name.singular,
              matches: [
                ...this.match(file, ['slug'], normalizedQuery),
                ...this.match(file.name.singular, [language], normalizedQuery),
                ...this.match(file.name.plural, [language], normalizedQuery),
                ...this.match(file.description, [language], normalizedQuery),
              ],
            };
            return result;
          }
          default:
            break;
        }
      });
    });
  }

  private match<T extends Object>(obj: T, keys: (keyof T)[], query: string) {
    const matches = [];

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const value = obj[key];

      if (typeof value === 'string') {
        if (value.toLowerCase().includes(query.toLowerCase())) {
          const matchStart = value.toLowerCase().indexOf(query.toLowerCase());
          const matchEnd = matchStart + query.length;

          matches.push({
            key: String(keys[index]),
            prefix: this.truncate(value.substring(0, matchStart), 'start'),
            match: value.substring(matchStart, matchEnd),
            suffix: this.truncate(
              value.substring(matchEnd, value.length),
              'end'
            ),
          });
        }
      }
    }

    return matches;
  }

  private truncate(value: string, at: 'start' | 'end', limit = 15) {
    if (at === 'start') {
      return `${value.substring(value.length - limit, value.length)}`;
    } else {
      return `${value.substring(0, limit)}`;
    }
  }
}
