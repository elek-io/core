import { EOL } from 'os';
import { GitError } from '../error/index.js';
import {
  countGitTagsSchema,
  createGitTagSchema,
  deleteGitTagSchema,
  gitTagSchema,
  listGitTagsSchema,
  readGitTagSchema,
  serviceTypeSchema,
  type CountGitTagsProps,
  type CreateGitTagProps,
  type CrudServiceWithListCount,
  type DeleteGitTagProps,
  type ElekIoCoreOptions,
  type GitTag,
  type ListGitTagsProps,
  type PaginatedList,
  type ReadGitTagProps,
} from '../schema/index.js';
import { datetime, uuid } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import { GitService } from './GitService.js';

/**
 * Service that manages CRUD functionality for GitTags
 */
export class GitTagService
  extends AbstractCrudService
  implements CrudServiceWithListCount<GitTag>
{
  private git: GitService['git'];

  public constructor(options: ElekIoCoreOptions, git: GitService['git']) {
    super(serviceTypeSchema.Enum.GitTag, options);

    this.git = git;
  }

  /**
   * Creates a new tag
   *
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---annotate
   */
  public async create(props: CreateGitTagProps): Promise<GitTag> {
    createGitTagSchema.parse(props);

    const id = uuid();
    let args = ['tag', '--annotate', id];

    if (props.hash) {
      args = [...args, props.hash];
    }

    args = [...args, '-m', props.message];

    await this.git(props.path, args);
    const tag = await this.read({ path: props.path, id });

    return tag;
  }

  /**
   * Returns a tag by ID
   *
   * Internally uses list() but only returns the tag with matching ID.
   */
  public async read(props: ReadGitTagProps): Promise<GitTag> {
    readGitTagSchema.parse(props);

    const tags = await this.list({ path: props.path });
    const tag = tags.list.find((tag) => {
      return tag.id === props.id;
    });

    if (!tag) {
      throw new GitError(
        `Provided tag with UUID "${props.id}" did not match any known tags`
      );
    }

    return tag;
  }

  /**
   * Updating a git tag is not supported.
   * Please delete the old and create a new one
   *
   * @see https://git-scm.com/docs/git-tag#_on_re_tagging
   */
  public async update(): Promise<never> {
    throw new Error(
      'Updating a git tag is not supported. Please delete the old and create a new one'
    );
  }

  /**
   * Deletes a tag
   *
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---delete
   *
   * @param path  Path to the repository
   * @param id    UUID of the tag to delete
   */
  public async delete(props: DeleteGitTagProps): Promise<void> {
    deleteGitTagSchema.parse(props);

    const args = ['tag', '--delete', props.id];
    await this.git(props.path, args);
  }

  /**
   * Gets all local tags or filter them by pattern
   *
   * They are sorted by authordate of the commit, not when the tag is created.
   * This ensures tags are sorted correctly in the timeline of their commits.
   *
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---list
   */
  public async list(props: ListGitTagsProps): Promise<PaginatedList<GitTag>> {
    listGitTagsSchema.parse(props);

    let args = ['tag', '--list'];

    args = [
      ...args,
      '--sort=-*authordate',
      '--format=%(refname:short)|%(subject)|%(*authorname)|%(*authoremail)|%(*authordate:iso-strict)',
    ];
    const result = await this.git(props.path, args);

    const noEmptyLinesArr = result.stdout.split(EOL).filter((line) => {
      return line.trim() !== '';
    });

    const lineObjArr = noEmptyLinesArr.map((line) => {
      const lineArray = line.split('|');
      return {
        id: lineArray[0],
        message: lineArray[1],
        author: {
          name: lineArray[2],
          email: lineArray[3],
        },
        datetime: datetime(lineArray[4]),
      };
    });

    const gitTags = lineObjArr.filter(this.isGitTag.bind(this));

    return {
      total: gitTags.length,
      limit: 0,
      offset: 0,
      list: gitTags,
    };
  }

  /**
   * Returns the total number of tags inside given repository
   *
   * Internally uses list(), so do not use count()
   * in conjuncion with it to avoid multiple git calls.
   *
   * @param path Path to the repository
   */
  public async count(props: CountGitTagsProps): Promise<number> {
    countGitTagsSchema.parse(props);

    const gitTags = await this.list({ path: props.path });
    return gitTags.total;
  }

  /**
   * Type guard for GitTag
   *
   * @param obj The object to check
   */
  private isGitTag(obj: unknown): obj is GitTag {
    return gitTagSchema.safeParse(obj).success;
  }
}
