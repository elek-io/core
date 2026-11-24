import Fs from 'fs-extra';
import Path from 'node:path';
import {
  collectionFileSchema,
  componentFileSchema,
  contractFileSchema,
  contractSchema,
  contractVersionFileSchema,
  countContractsSchema,
  createContractSchema,
  contractFromProjectSchema,
  listContractsSchema,
  objectTypeSchema,
  readContractSchema,
  readContractVersionSchema,
  readThemeContractSchema,
  serviceTypeSchema,
  themeVersionsSchema,
  CONTRACT_FILE_NAME,
  type CollectionFile,
  type ComponentFile,
  type Contract,
  type ContractFile,
  type ContractVersionFile,
  type CountContractsProps,
  type CreateContractProps,
  type ElekIoCoreOptions,
  type ContractFromProjectProps,
  type KeptContract,
  type ListContractsProps,
  type PaginatedList,
  type ReadContractProps,
  type ReadContractVersionProps,
  type ReadThemeContractProps,
  type ThemeContract,
  type ThemeVersionsProps,
  type Uuid,
} from '../schema/index.js';
import { missingContractReferences } from '../util/contract.js';
import { classifyUnsafeAddress } from '../util/git.js';
import { isFileNotFound, type PathTo } from '../util/node.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
import {
  newestThemeVersion,
  themeVersions,
  themeVersionTag,
  versionsNewestFirst,
} from '../util/theme.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { CacheService } from './CacheService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Contracts, each the folder `contracts/<uuid>/` holding `contract.json`
 * and one `<version>.json` copy per version a Destination uses.
 *
 * A Contract states what a theme needs. `generate()` writes one from a
 * Project, `readFromTheme()` reads one from a git address with the person's
 * own git access, and `keep()` puts it into the Project once per origin.
 *
 * @see ../../docs/destinations.md
 */
export class ContractService extends AbstractEntityService {
  private coreVersion: string;

  public constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    cacheService: CacheService
  ) {
    super(
      serviceTypeSchema.enum.Contract,
      options,
      pathTo,
      logService,
      gitService,
      jsonFileService,
      cacheService
    );
    this.coreVersion = coreVersion;
  }

  /**
   * The Project's Collections and Components as a Contract, under the given
   * name and version. Nothing is written, the caller decides where it goes.
   *
   * `languages` defaults to the Project's own supported languages. Throws
   * `BadRequest` naming every Collection and Component a field definition
   * points at that the Project does not hold, because a Contract whose
   * references lead nowhere cannot be filled.
   */
  public async generate(props: ContractFromProjectProps): Promise<Contract> {
    return this.validated(
      'generate',
      contractFromProjectSchema,
      props,
      async (validatedProps) => {
        const collections = await this.readCollections(
          validatedProps.projectId
        );
        const components = await this.readComponents(validatedProps.projectId);

        const missing = missingContractReferences({ collections, components });
        if (missing.length > 0) {
          const named = missing.map((reference) => {
            return `${reference.objectType} "${reference.id}", which field definition "${reference.fieldDefinitionId}" of "${reference.referencedBy}" points at`;
          });
          throw CoreError.badRequest(
            `Cannot generate a Contract of Project "${validatedProps.projectId}", because it would leave out ${named.join(', ')}. Point the field definition at something the Project holds, or add what is missing.`
          );
        }

        const languages =
          validatedProps.languages ??
          (await this.readProjectLanguages(validatedProps.projectId));

        return contractSchema.parse({
          name: validatedProps.name,
          version: validatedProps.version,
          languages,
          collections,
          components,
        });
      }
    );
  }

  /**
   * The Contract a theme states at a git address, read at the newest version
   * it tagged or at the one given, with the version and the commit it came
   * from. Core reads it with the person's own git access alone.
   *
   * Throws `BadRequest` for an address it refuses and for a Contract that
   * does not parse or carries another version, `PreconditionFailed` for an
   * address that tagged none, `NotFound` when the version holds no Contract,
   * `Unauthorized` without access and `Internal` for one it cannot read.
   *
   * @see ../../docs/destinations.md
   */
  public async readFromTheme(
    props: ReadThemeContractProps
  ): Promise<ThemeContract> {
    return this.validated(
      'readFromTheme',
      readThemeContractSchema,
      props,
      async (validatedProps) => {
        const refNames = await this.tagRefNames(validatedProps.url);
        const version = validatedProps.version ?? newestThemeVersion(refNames);
        if (version === null) {
          throw CoreError.preconditionFailed(
            'The theme has tagged no version. Tag one as "v<version>", such as "v1.0.0", and read it again.',
            undefined,
            'theme_without_version'
          );
        }
        const tag = themeVersionTag(version);
        if (refNames.includes(`refs/tags/${tag}`) === false) {
          throw CoreError.notFound(
            `The theme has no tag "${tag}". Tag that version, or read one it has tagged.`
          );
        }

        const scratchPath = Path.join(this.pathTo.tmp, uuid());
        try {
          const read = await this.gitService.readFileAtRemoteTag({
            url: validatedProps.url,
            tag,
            filePath: Path.join(scratchPath, CONTRACT_FILE_NAME),
            scratchPath,
          });
          let content: unknown;
          try {
            content = JSON.parse(read.content);
          } catch (error) {
            // The file rather than what V8 quoted out of it, which is the
            // theme's own text. See contributing/logging.md
            throw CoreError.badRequest(
              `The ${CONTRACT_FILE_NAME} of the theme at "${tag}" is no Contract: it does not parse as JSON.`,
              error
            );
          }
          const parsed = contractSchema.safeParse(content);
          if (parsed.success === false) {
            throw CoreError.badRequest(
              `The ${CONTRACT_FILE_NAME} of the theme at "${tag}" is no Contract: ${parsed.error.message}`,
              parsed.error
            );
          }
          if (parsed.data.version !== version) {
            throw CoreError.badRequest(
              `The ${CONTRACT_FILE_NAME} of the theme at "${tag}" carries version "${parsed.data.version}" rather than "${version}". Generate it with the version its tag names.`
            );
          }
          return { contract: parsed.data, version, commit: read.commit };
        } catch (error) {
          throw this.asMissingContract(error, tag);
        } finally {
          await Fs.remove(scratchPath).catch(() => undefined);
        }
      }
    );
  }

  /**
   * The versions a theme tagged at a git address, newest first, read with
   * the person's own git access. Empty for an address that tagged none.
   *
   * A pre-release is listed too, because an app may offer one. It is never
   * taken unless it is named, see `readFromTheme`.
   *
   * Throws what `readFromTheme` throws about the address itself.
   *
   * @see ../../docs/destinations.md
   */
  public async versionsFromTheme(props: ThemeVersionsProps): Promise<string[]> {
    return this.validated(
      'versionsFromTheme',
      themeVersionsSchema,
      props,
      async (validatedProps) => {
        return themeVersions(await this.tagRefNames(validatedProps.url));
      }
    );
  }

  /**
   * Keeps a Contract in the Project and commits: `contract.json` once per
   * origin, and the copy of the given version beside it.
   *
   * An origin the Project already keeps comes back as it is, with the copy
   * added when it is new, so a second Destination on one theme shares the
   * Contract. The name follows the Contract read at the origin.
   *
   * Throws `BadRequest` for an origin `readFromTheme` refuses, which is
   * written into the Project here, and `PreconditionFailed` while read-only
   * or on a provisioned copy.
   */
  public async keep(props: CreateContractProps): Promise<KeptContract> {
    this.assertNotReadOnly('keep');
    const { projectId } = this.parseOrThrow(
      'keep',
      createContractSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('keep', projectId);

    return this.mutating(
      'keep',
      createContractSchema,
      props,
      async (validatedProps) => {
        const { projectId: id_, contract, origin, commit } = validatedProps;
        // Here as well as in `readFromTheme`, because this is what writes the
        // origin into the Project and a caller may reach it on its own
        const unsafe = classifyUnsafeAddress(origin.url);
        if (unsafe) {
          throw unsafe;
        }
        const kept = await this.findByOrigin(id_, origin);
        const hasVersion = kept?.versions.includes(contract.version) === true;
        const isNameChanged = kept !== undefined && kept.name !== contract.name;
        if (kept !== undefined && hasVersion && isNameChanged === false) {
          return kept;
        }

        const id = kept?.id ?? uuid();
        const projectPath = this.pathTo.project(id_);
        const contractPath = this.pathTo.contract(id_, id);
        const contractFilePath = this.pathTo.contractFile(id_, id);
        const versionFilePath = this.pathTo.contractVersionFile(
          id_,
          id,
          contract.version
        );
        const contractFile: ContractFile =
          kept === undefined
            ? {
                objectType: 'contract',
                id,
                coreVersion: this.coreVersion,
                created: datetime(),
                updated: null,
                name: contract.name,
                origin,
              }
            : {
                ...this.withoutVersions(kept),
                name: contract.name,
                updated: datetime(),
              };
        const versionFile: ContractVersionFile = {
          version: contract.version,
          commit,
          contract,
        };
        // Only what this call creates. A rollback removes these before it
        // resets, so a file that was already there must not be in the list:
        // a reset that fails too would leave it gone
        const created: string[] = [];
        if (kept === undefined) {
          created.push(contractPath);
        } else if (hasVersion === false) {
          created.push(versionFilePath);
        }

        await this.withGitRollback(
          projectPath,
          async () => {
            await Fs.ensureDir(contractPath);
            const written: string[] = [];
            if (kept === undefined) {
              await this.jsonFileService.create(
                contractFile,
                contractFilePath,
                contractFileSchema
              );
              written.push(contractFilePath);
            } else if (isNameChanged) {
              await this.jsonFileService.update(
                contractFile,
                contractFilePath,
                contractFileSchema
              );
              written.push(contractFilePath);
            }
            if (hasVersion === false) {
              await this.jsonFileService.create(
                versionFile,
                versionFilePath,
                contractVersionFileSchema
              );
              written.push(versionFilePath);
            }
            await this.gitService.add(projectPath, written);
            await this.gitService.commit(projectPath, {
              method: kept === undefined ? 'create' : 'update',
              reference: { objectType: 'contract', id },
            });
          },
          created
        );

        return this.read({ projectId: id_, id });
      }
    );
  }

  /**
   * A Contract the Project keeps, with every version it holds a copy of.
   * Throws `NotFound` when the Project keeps no Contract under that id.
   */
  public async read(props: ReadContractProps): Promise<KeptContract> {
    return this.validated(
      'read',
      readContractSchema,
      props,
      async (validatedProps) => {
        const contractFile = await this.jsonFileService.read(
          this.pathTo.contractFile(validatedProps.projectId, validatedProps.id),
          contractFileSchema
        );
        return {
          ...contractFile,
          versions: await this.versionsOf(
            validatedProps.projectId,
            validatedProps.id
          ),
        };
      }
    );
  }

  /**
   * The copy of a Contract at one version, with the commit of its origin it
   * was read from. Throws `NotFound` when the Project holds no copy of it.
   */
  public async readVersion(
    props: ReadContractVersionProps
  ): Promise<ContractVersionFile> {
    return this.validated(
      'readVersion',
      readContractVersionSchema,
      props,
      async (validatedProps) => {
        return this.jsonFileService.read(
          this.pathTo.contractVersionFile(
            validatedProps.projectId,
            validatedProps.id,
            validatedProps.version
          ),
          contractVersionFileSchema
        );
      }
    );
  }

  /**
   * One page of the Contracts the Project keeps, newest first.
   *
   * Every Contract is read before the page is cut, because the folder order
   * says nothing about when one was kept, so `total` counts the folders
   * while the page comes out of the ones that read.
   *
   * A Project holding no `contracts` folder, which every Project written
   * before Contracts existed is, lists nothing rather than failing.
   */
  public async list(
    props: ListContractsProps
  ): Promise<PaginatedList<KeptContract>> {
    return this.validated(
      'list',
      listContractsSchema,
      props,
      async (validatedProps) => {
        const limit = validatedProps.limit ?? 15;
        const offset = validatedProps.offset ?? 0;
        const ids = await this.contractIds(validatedProps.projectId);
        const kept = await this.collectResults(
          ids.map((id) =>
            this.read({ projectId: validatedProps.projectId, id })
          )
        );
        const newestFirst = kept.toSorted((a, b) => {
          return b.created.localeCompare(a.created);
        });
        return {
          total: ids.length,
          limit,
          offset,
          list:
            limit === 0
              ? newestFirst.slice(offset)
              : newestFirst.slice(offset, offset + limit),
        };
      }
    );
  }

  /** How many Contracts the Project keeps, without reading one */
  public async count(props: CountContractsProps): Promise<number> {
    return this.validated(
      'count',
      countContractsSchema,
      props,
      async (validatedProps) => {
        return (await this.contractIds(validatedProps.projectId)).length;
      }
    );
  }

  /**
   * The ref names a git address advertises for its tags, read with the
   * person's own git access. Refuses an address Core does not accept before
   * git runs, because both callers write or read from it.
   */
  private async tagRefNames(url: string): Promise<string[]> {
    const unsafe = classifyUnsafeAddress(url);
    if (unsafe) {
      throw unsafe;
    }
    try {
      return await this.gitService.lsRemote(url, {
        tags: true,
        isOwnGitAccess: true,
      });
    } catch (error) {
      throw this.asUnreadableAddress(error);
    }
  }

  /** The Contract the Project keeps for an origin, or undefined for none */
  private async findByOrigin(
    projectId: Uuid,
    origin: CreateContractProps['origin']
  ): Promise<KeptContract | undefined> {
    const ids = await this.contractIds(projectId);
    for (const id of ids) {
      const kept = await this.read({ projectId, id }).catch(() => undefined);
      if (
        kept !== undefined &&
        kept.origin.kind === origin.kind &&
        kept.origin.url === origin.url
      ) {
        return kept;
      }
    }
    return undefined;
  }

  /** The ids of the contract folders, empty when the Project has none */
  private async contractIds(projectId: Uuid): Promise<Uuid[]> {
    if ((await Fs.pathExists(this.pathTo.contracts(projectId))) === false) {
      return [];
    }
    const references = await this.listReferences(
      objectTypeSchema.enum.contract,
      projectId
    );
    return references.map(({ id }) => id);
  }

  /** The versions the Project holds a copy of, newest first */
  private async versionsOf(projectId: Uuid, id: Uuid): Promise<string[]> {
    const names = await Fs.readdir(this.pathTo.contract(projectId, id)).catch(
      (error: unknown) => {
        if (isFileNotFound(error)) {
          throw CoreError.notFound(
            `Project "${projectId}" keeps no Contract "${id}"`
          );
        }
        throw error;
      }
    );
    return versionsNewestFirst(
      names
        .filter((name) => name.endsWith('.json') && name !== 'contract.json')
        .map((name) => name.slice(0, -'.json'.length))
    );
  }

  /** The stored file of a kept Contract, without what `read` added to it */
  private withoutVersions(kept: KeptContract): ContractFile {
    const { versions: _, ...contractFile } = kept;
    return contractFile;
  }

  /**
   * Turns a git failure at the address itself into words a person can act
   * on, and leaves every refusal Core already typed as it is, the
   * `Unauthorized` of an address needing access first.
   *
   * It stays `Internal`, because what git failed at is between the two: a
   * repository that is not there, a host that is not answering and a git
   * that would not run all arrive as the same exit code, and git's own
   * words are localized, so they are no basis for telling them apart. They
   * stay on the cause.
   */
  private asUnreadableAddress(error: unknown): unknown {
    if (error instanceof CoreError && error.type !== 'Internal') {
      return error;
    }
    return CoreError.internal(
      'Could not read the theme at that address. Check that it names a git repository this machine can reach, and that you have access to it.',
      error
    );
  }

  /**
   * Turns a theme whose tag holds no `elek.contract.json` into the
   * `NotFound` the caller can act on, and leaves every other failure as it
   * is. git reports the missing blob as a failed `cat-file`, so the shape
   * rather than a type says so.
   */
  private asMissingContract(error: unknown, tag: string): unknown {
    if (
      error instanceof CoreError &&
      error.type === 'Internal' &&
      error.message.includes('cat-file')
    ) {
      return CoreError.notFound(
        `The theme has no ${CONTRACT_FILE_NAME} at "${tag}". Generate it with "elek generate:contract", commit it and tag that version again.`
      );
    }
    return error;
  }

  /** Every Collection of a Project, in folder order */
  private async readCollections(projectId: Uuid): Promise<CollectionFile[]> {
    const references = await this.listReferences(
      objectTypeSchema.enum.collection,
      projectId
    );
    return Promise.all(
      references.map(({ id }) =>
        this.jsonFileService.read(
          this.pathTo.collectionFile(projectId, id),
          collectionFileSchema
        )
      )
    );
  }

  /** Every Component of a Project, in folder order */
  private async readComponents(projectId: Uuid): Promise<ComponentFile[]> {
    const references = await this.listReferences(
      objectTypeSchema.enum.component,
      projectId
    );
    return Promise.all(
      references.map(({ id }) =>
        this.jsonFileService.read(
          this.pathTo.componentFile(projectId, id),
          componentFileSchema
        )
      )
    );
  }
}
