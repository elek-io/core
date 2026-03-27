import { CoreError } from '../util/shared.js';
import {
  countGitTagsSchema,
  createGitTagSchema,
  deleteGitTagSchema,
  gitTagMessageSchema,
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
  type GitTagMessage,
  type ListGitTagsProps,
  type PaginatedList,
  type ReadGitTagProps,
} from '../schema/index.js';
import { datetime, uuid } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { GitService } from './GitService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for GitTags
 */
export class GitTagService
  extends AbstractService
  implements CrudServiceWithListCount<GitTag>
{
  private git: GitService['git'];

  public constructor(
    options: ElekIoCoreOptions,
    git: GitService['git'],
    logService: LogService
  ) {
    super(serviceTypeSchema.enum.GitTag, options, logService);

    this.git = git;
  }

  /**
   * Creates a new tag
   *
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---annotate
   */
  public async create(props: CreateGitTagProps): Promise<GitTag> {
    return this.validated('create', createGitTagSchema, props, async () => {
      const id = uuid();
      let args = ['tag', '--annotate', id];

      if (props.hash) {
        args = [...args, props.hash];
      }

      const subject = this.serializeTagMessage(props.message);
      const trailers = this.tagMessageToTrailers(props.message);
      const fullMessage = `${subject}\n\n${trailers.join('\n')}`;

      args = [...args, '-m', fullMessage];

      await this.git(props.path, args);
      return this.read({ path: props.path, id });
    });
  }

  /**
   * Returns a tag by ID
   *
   * Internally uses list() but only returns the tag with matching ID.
   */
  public async read(props: ReadGitTagProps): Promise<GitTag> {
    return this.validated('read', readGitTagSchema, props, async () => {
      const tags = await this.list({ path: props.path });
      const tag = tags.list.find((tag) => tag.id === props.id);

      if (!tag) {
        throw CoreError.notFound(
          `Provided tag with UUID "${props.id}" did not match any known tags`
        );
      }

      return tag;
    });
  }

  /**
   * Updating a git tag is not supported.
   * Please delete the old and create a new one
   *
   * @deprecated
   * @see https://git-scm.com/docs/git-tag#_on_re_tagging
   */
  public async update(): Promise<GitTag> {
    throw CoreError.badRequest(
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
    return this.validated('delete', deleteGitTagSchema, props, async () => {
      const args = ['tag', '--delete', props.id];
      await this.git(props.path, args);
    });
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
    return this.validated('list', listGitTagsSchema, props, async () => {
      let args = ['tag', '--list'];

      const format = [
        '%(refname:short)',
        '%(trailers:key=Type,valueonly)',
        '%(trailers:key=Version,valueonly)',
        '%(trailers:key=Core-Version,valueonly)',
        '%(*authorname)',
        '%(*authoremail)',
        '%(*authordate:iso-strict)',
      ].join('|');
      args = [...args, '--sort=-*authordate', `--format=${format}`];

      const result = await this.git(props.path, args);

      // Trailer values from %(trailers:key=...,valueonly) include trailing newlines.
      // Collapsing "\n|" into "|" rejoins the pipe-delimited fields into single lines.
      const cleaned = result.stdout.replace(/\n\|/g, '|');

      const noEmptyLinesArr = cleaned.split('\n').filter((line) => {
        return line.trim() !== '';
      });

      const lineObjArr = noEmptyLinesArr.map((line) => {
        const lineArray = line.split('|');

        // Remove the '<' and '>' enclosing the email
        if (lineArray[5]?.startsWith('<') && lineArray[5]?.endsWith('>')) {
          lineArray[5] = lineArray[5].slice(1, -1);
        }

        return {
          id: lineArray[0],
          message: this.parseTagTrailers(
            lineArray[1]?.trim(),
            lineArray[2]?.trim(),
            lineArray[3]?.trim()
          ),
          author: {
            name: lineArray[4],
            email: lineArray[5],
          },
          datetime: datetime(lineArray[6]),
        };
      });

      const gitTags = lineObjArr.filter(this.isGitTag.bind(this));

      return {
        total: gitTags.length,
        limit: 0,
        offset: 0,
        list: gitTags,
      };
    });
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
    return this.validated('count', countGitTagsSchema, props, async () => {
      const tags = await this.list({ path: props.path });
      return tags.total;
    });
  }

  /**
   * Serializes a GitTagMessage into a human-readable subject line
   */
  private serializeTagMessage(message: GitTagMessage): string {
    const type = message.type.charAt(0).toUpperCase() + message.type.slice(1);
    const version =
      message.type === 'upgrade' ? message.coreVersion : message.version;
    return `${type} ${version}`;
  }

  /**
   * Converts a GitTagMessage into git trailer lines
   */
  private tagMessageToTrailers(message: GitTagMessage): string[] {
    const trailers = [`Type: ${message.type}`];
    if (message.type === 'upgrade') {
      trailers.push(`Core-Version: ${message.coreVersion}`);
    } else {
      trailers.push(`Version: ${message.version}`);
    }
    return trailers;
  }

  /**
   * Parses git trailer values back into a GitTagMessage
   */
  private parseTagTrailers(
    type: string | undefined,
    version: string | undefined,
    coreVersion: string | undefined
  ): GitTagMessage | null {
    switch (type) {
      case 'upgrade':
        return gitTagMessageSchema.parse({ type, coreVersion });
      case 'release':
      case 'preview':
        return gitTagMessageSchema.parse({ type, version });
      default:
        this.logService.warn({
          source: 'core',
          message: `Tag with ID "${type}" has an invalid or missing Type trailer and will be ignored`,
        });
        return null;
    }
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
