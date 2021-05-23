import { ElekIoCoreOptions } from '../../type/general';
import { SearchResult } from '../../type/search';
import { ServiceType } from '../../type/service';
import Project from '../model/Project';
import AbstractService from './AbstractService';
import AssetService from './AssetService';
import BlockService from './BlockService';
import EventService from './EventService';
import PageService from './PageService';
import SnapshotService from './SnapshotService';

/**
 * Service that manages CRUD functionality for page files on disk
 */
export default class SearchService extends AbstractService {
  private eventService: EventService;
  private pageService: PageService;
  private assetService: AssetService;
  private blockService: BlockService;
  private snapshotService: SnapshotService;

  constructor(options: ElekIoCoreOptions, eventService: EventService, pageService: PageService, assetService: AssetService, blockService: BlockService, snapshotService: SnapshotService) {
    super(ServiceType.SEARCH, options);

    this.eventService = eventService;
    this.pageService = pageService;
    this.assetService = assetService;
    this.blockService = blockService;
    this.snapshotService = snapshotService;
  }

  /**
   * Search all models inside the project for given query
   * 
   * @todo Implement SearchOptions parameter
   * 
   * @param project Project to search in
   * @param query Query to search for
   */
  public async search(project: Project, query: string) {
    const results: SearchResult[] = [];
    const paginatedLists = (await Promise.all([
      this.pageService.list(project, [], query),
      this.assetService.list(project, [], query),
      this.blockService.list(project, [], query)
    ])).flat();

    paginatedLists.forEach((paginatedList) => {
      paginatedList.list.flat().forEach((model) => {
        const result: SearchResult = {
          id: model.id,
          language: model.language,
          name: model.name,
          type: model.type,
          matches: []
        };

        for (const [key, value] of Object.entries(model)) {
          const valueString = String(value);
          if (valueString.toLowerCase().includes(query.toLowerCase())) {
            const matchStart = valueString.toLowerCase().indexOf(query.toLowerCase());
            const matchEnd = matchStart + query.length;

            result.matches.push({
              key,
              prefix: this.truncate(valueString.substring(0, matchStart), 'start'),
              match: valueString.substring(matchStart, matchEnd),
              suffix: this.truncate(valueString.substring(matchEnd, valueString.length), 'end')
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