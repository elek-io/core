import {
  serviceTypeSchema,
  type ElekIoCoreOptions,
  type ObjectType,
  type SearchResult,
} from '@elek-io/shared';
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
    objectType?: ObjectType
  ) {
    const results: SearchResult[] = [];
    const normalizedQuery = query.trim();

    if (normalizedQuery === '') {
      return results;
    }

    const paginatedLists = (
      await Promise.all([this.assetService.list({ projectId, filter: query })])
    ).flat();

    paginatedLists.forEach((paginatedList) => {
      paginatedList.list.flat().forEach((file) => {
        const result: SearchResult = {
          id: file.id,
          language: file.language,
          name: file.name,
          type: file.objectType,
          matches: [],
        };

        for (const [key, value] of Object.entries(file)) {
          const valueString = String(value);
          if (
            valueString.toLowerCase().includes(normalizedQuery.toLowerCase())
          ) {
            const matchStart = valueString
              .toLowerCase()
              .indexOf(normalizedQuery.toLowerCase());
            const matchEnd = matchStart + normalizedQuery.length;

            result.matches.push({
              key,
              prefix: this.truncate(
                valueString.substring(0, matchStart),
                'start'
              ),
              match: valueString.substring(matchStart, matchEnd),
              suffix: this.truncate(
                valueString.substring(matchEnd, valueString.length),
                'end'
              ),
            });
          }
        }

        if (result.matches.length > 0) {
          results.push(result);
        }
      });
    });

    return results;
  }

  private truncate(value: string, at: 'start' | 'end', limit = 15) {
    if (at === 'start') {
      return `${value.substring(value.length - limit, value.length)}`;
    } else {
      return `${value.substring(0, limit)}`;
    }
  }
}
