import Fs from 'fs-extra';
import { z } from '@hono/zod-openapi';
import {
  assetFileSchema,
  entryFileSchema,
  objectTypeSchema,
  serviceTypeSchema,
  type AssetFieldDefinition,
  type ComponentResolver,
  type DanglingReference,
  type ElekIoCoreOptions,
  type EntryFieldDefinition,
  type EntryFile,
  type EntryReferenceIssue,
  type EntryReferenceIssueLocation,
  type FieldDefinition,
  type MdAstAssetReference,
  type MdAstEntryReference,
  type MdAstRoot,
  type ReferenceComponentPathSegment,
  type ReferencingEntry,
  type SupportedLanguage,
  type Uuid,
  type Value,
} from '../schema/index.js';
import { CoreError } from '../util/shared.js';
import { entriesOf } from '../util/typedObject.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import { migrateEntryFile } from './migrations/index.js';
import type { GitService } from './GitService.js';
import type { CacheService } from './CacheService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';
import type { PathTo } from '../util/node.js';

/**
 * Scans Entry references across a Project. It owns the three reference gates,
 * so the entity services depend on one place through their constructor:
 * `findEntriesReferencing` on delete, `validateValueReferences` on write and
 * `findDanglingReferences` on sync.
 *
 * Extends `AbstractEntityService` to reuse `listReferences` and
 * `jsonFileService`. It only reads, so the inherited `gitService` is unused.
 *
 * @see ../../contributing/reference-integrity.md
 */
export class ReferenceService extends AbstractEntityService {
  private coreVersion: string;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    cacheService: CacheService
  ) {
    super(
      serviceTypeSchema.enum.Reference,
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
   * Reads an Entry file, fast-pathing a current-version file (which also
   * populates the cache) and falling back to `migrateEntryFile(unsafeRead)`
   * only on a Zod shape mismatch. Older Entries (for example brought in by a
   * pull or merge) may predate the current schema, so they are upgraded through
   * the migration chain instead of throwing. Any other read error (a corrupt
   * file, a permission error or an ENOENT race) is a real failure and propagates.
   *
   * Shared by every on-demand Entry scan: the reverse and sync reference gates
   * here, plus `EntryService.findUniqueValueConflicts` (uniqueness).
   */
  public async readEntryFileMigrating(
    entryFilePath: string
  ): Promise<EntryFile> {
    try {
      return await this.jsonFileService.read(entryFilePath, entryFileSchema);
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        throw error;
      }
      return migrateEntryFile(
        this.coreVersion,
        await this.jsonFileService.unsafeRead(entryFilePath)
      );
    }
  }

  /**
   * Finds every Entry in the Project whose values still reference the given
   * target (an Asset, another Entry, or a whole Collection). Used by delete to
   * block a deletion that would leave dangling references behind.
   *
   * Scans every Entry on demand rather than maintaining a persisted reverse
   * index, which would go stale on a pull or merge. Self-references never
   * block. Returns one record per referring Entry, the first match within
   * that Entry.
   *
   * @see ../../contributing/reference-integrity.md
   */
  public async findEntriesReferencing(
    target: ReferenceTarget
  ): Promise<ReferencingEntry[]> {
    const results: ReferencingEntry[] = [];

    for (const collectionReference of await this.listReferences(
      objectTypeSchema.enum.collection,
      target.projectId
    )) {
      const collectionId = collectionReference.id;

      // For a Collection-delete target, every Entry inside the doomed Collection
      // is being removed too, so any reference it holds vanishes cleanly and
      // must not block. Skip the whole Collection as a source.
      if (
        'collectionId' in target &&
        !('entryId' in target) &&
        collectionId === target.collectionId
      ) {
        continue;
      }

      for (const entryReference of await this.listReferences(
        objectTypeSchema.enum.entry,
        target.projectId,
        collectionId
      )) {
        const entryId = entryReference.id;

        // A self-reference must not block the Entry's own deletion.
        if (
          'entryId' in target &&
          entryId === target.entryId &&
          collectionId === target.collectionId
        ) {
          continue;
        }

        const entryFilePath = this.pathTo.entryFile(
          target.projectId,
          collectionId,
          entryId
        );
        const entryFile = await this.readEntryFileMigrating(entryFilePath);

        const match = this.findMatchingReference(entryFile.values, target);
        if (match) {
          results.push({
            collectionId,
            entryId,
            fieldSlug: match.fieldSlug,
            via: match.via,
            componentPath: match.componentPath,
          });
        }
      }
    }

    return results;
  }

  /**
   * Returns the first reference within `values` that points at `target`, or
   * `undefined` if none do. Walks flat reference fields, mdast nodes and
   * references nested inside `dynamic`/component items alike.
   *
   * Discriminates the three target shapes in order: an Asset (`assetId`), a
   * single Entry (`entryId`), or a whole Collection (neither). The Collection
   * case matches any Entry reference whose `collectionId` is the target, plus a
   * direct reference to the Collection as a whole.
   */
  private findMatchingReference(
    values: Record<string, Value>,
    target: ReferenceTarget
  ): FoundReference | undefined {
    for (const [fieldSlug, value] of Object.entries(values)) {
      for (const ref of collectReferencesInValue(value, fieldSlug, [])) {
        if ('assetId' in target) {
          if (ref.refKind === 'asset' && ref.id === target.assetId) {
            return ref;
          }
        } else if ('entryId' in target) {
          if (
            ref.refKind === 'entry' &&
            ref.id === target.entryId &&
            ref.collectionId === target.collectionId
          ) {
            return ref;
          }
        } else {
          if (
            ref.refKind === 'entry' &&
            ref.collectionId === target.collectionId
          ) {
            return ref;
          }
          if (ref.refKind === 'collection' && ref.id === target.collectionId) {
            return ref;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Forward whole-tree integrity scan used by sync before pushing. Walks every
   * Entry in every Collection and records each reference whose target file is
   * absent on disk.
   *
   * Pure existence only, no field definitions and no MIME checks. Unlike
   * `findEntriesReferencing` this reports every dangling reference, since each
   * one is a separate thing to repair.
   *
   * @see ../../contributing/reference-integrity.md
   */
  public async findDanglingReferences(
    projectId: string
  ): Promise<DanglingReference[]> {
    const results: DanglingReference[] = [];

    for (const collectionReference of await this.listReferences(
      objectTypeSchema.enum.collection,
      projectId
    )) {
      const collectionId = collectionReference.id;

      for (const entryReference of await this.listReferences(
        objectTypeSchema.enum.entry,
        projectId,
        collectionId
      )) {
        const entryId = entryReference.id;
        const entryFile = await this.readEntryFileMigrating(
          this.pathTo.entryFile(projectId, collectionId, entryId)
        );

        for (const [fieldSlug, value] of Object.entries(entryFile.values)) {
          for (const ref of collectReferencesInValue(value, fieldSlug, [])) {
            if (await this.referenceTargetExists(projectId, ref)) {
              continue;
            }
            results.push({
              collectionId,
              entryId,
              fieldSlug: ref.fieldSlug,
              via: ref.via,
              componentPath: ref.componentPath,
              targetKind: ref.refKind,
              targetId: ref.id,
              targetCollectionId:
                ref.refKind === 'entry' ? (ref.collectionId ?? null) : null,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Pure existence test for a single found reference's target. An Asset or
   * Entry target is a JSON file; a whole-Collection target is the Collection
   * folder. Entry references always carry their target's `collectionId`; the
   * unresolvable fallback never flags as dangling so a malformed ref cannot
   * block a sync on its own.
   */
  private async referenceTargetExists(
    projectId: string,
    ref: FoundReference
  ): Promise<boolean> {
    if (ref.refKind === 'asset') {
      return Fs.pathExists(this.pathTo.assetFile(projectId, ref.id));
    }
    if (ref.refKind === 'collection') {
      return Fs.pathExists(this.pathTo.collection(projectId, ref.id));
    }
    if (ref.collectionId === undefined) {
      return true;
    }
    return Fs.pathExists(
      this.pathTo.entryFile(projectId, ref.collectionId, ref.id)
    );
  }

  /**
   * Validates cross-entity reference targets on an Entry's values. Runs after
   * the per-field Zod schema accepted the structural shape, as the first step
   * inside `EntryService`'s create and update callbacks.
   *
   * Checks that every referenced Asset and Entry file exists, and that a
   * referenced Asset's `mimeType` is in the field's `ofAssetMimeTypes`
   * allowlist. Tree shape and `ofCollections` are already enforced by the
   * schema layer and are not re-checked.
   *
   * @see ../../contributing/reference-integrity.md
   */
  public async validateValueReferences(
    values: Record<string, Value>,
    fieldDefinitions: FieldDefinition[],
    projectId: string,
    resolver: ComponentResolver,
    componentPath: ReferenceComponentPathSegment[] = []
  ): Promise<EntryReferenceIssue[]> {
    const issues: EntryReferenceIssue[] = [];

    for (const fieldDef of fieldDefinitions) {
      const value = values[fieldDef.slug];
      if (value === undefined) continue;

      if (
        fieldDef.valueType === 'reference' &&
        value.valueType === 'reference'
      ) {
        await this.collectFlatReferenceIssues(
          value,
          fieldDef,
          projectId,
          issues,
          componentPath
        );
      } else if (
        fieldDef.valueType === 'mdast' &&
        value.valueType === 'mdast'
      ) {
        await this.collectMdAstReferenceIssues(
          value,
          fieldDef,
          projectId,
          issues,
          componentPath
        );
      } else if (
        fieldDef.valueType === 'component' &&
        value.valueType === 'component'
      ) {
        // Descend into each dynamic block item, validating its nested values
        // against the item's Component field definitions.
        for (const item of value.content) {
          issues.push(
            ...(await this.validateValueReferences(
              item.values,
              resolver(item.componentId),
              projectId,
              resolver,
              [
                ...componentPath,
                {
                  fieldSlug: fieldDef.slug,
                  itemId: item.id,
                  componentId: item.componentId,
                },
              ]
            ))
          );
        }
      }
    }

    return issues;
  }

  /**
   * Walks each language slot of a flat reference field's value, checking
   * each Entry / Asset reference against the filesystem.
   */
  private async collectFlatReferenceIssues(
    value: Extract<Value, { valueType: 'reference' }>,
    fieldDef: AssetFieldDefinition | EntryFieldDefinition,
    projectId: string,
    issues: EntryReferenceIssue[],
    componentPath: ReferenceComponentPathSegment[]
  ): Promise<void> {
    const allowedMimeTypes =
      fieldDef.fieldType === 'asset' ? fieldDef.ofAssetMimeTypes : null;

    for (const [lang, refs] of entriesOf(value.content)) {
      if (!refs) continue;

      for (let index = 0; index < refs.length; index++) {
        const ref = refs[index];
        if (ref === undefined) continue;

        if (ref.objectType === 'asset') {
          await this.checkAsset({
            projectId,
            assetId: ref.id,
            allowedMimeTypes,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath: [],
              index,
              componentPath,
            },
            issues,
          });
        } else if (ref.objectType === 'entry') {
          await this.checkEntry({
            projectId,
            collectionId: ref.collectionId,
            entryId: ref.id,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath: [],
              index,
              componentPath,
            },
            issues,
          });
        }
      }
    }
  }

  /**
   * Walks each language's mdast tree, checking every
   * `entryReference` / `assetReference` node against the filesystem.
   */
  private async collectMdAstReferenceIssues(
    value: Extract<Value, { valueType: 'mdast' }>,
    fieldDef: { slug: string; ofAssetMimeTypes: string[] },
    projectId: string,
    issues: EntryReferenceIssue[],
    componentPath: ReferenceComponentPathSegment[]
  ): Promise<void> {
    for (const [lang, root] of entriesOf(value.content)) {
      if (!root) continue;

      for (const { node, treePath } of collectMdAstRefs(root)) {
        if (node.type === 'assetReference') {
          await this.checkAsset({
            projectId,
            assetId: node.assetId,
            allowedMimeTypes: fieldDef.ofAssetMimeTypes,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath,
              index: null,
              componentPath,
            },
            issues,
          });
        } else {
          // node.type === 'entryReference'
          await this.checkEntry({
            projectId,
            collectionId: node.collectionId,
            entryId: node.entryId,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath,
              index: null,
              componentPath,
            },
            issues,
          });
        }
      }
    }
  }

  /**
   * Reads an Asset's file directly via JsonFileService (bypassing
   * `AssetService.read`'s `validated()` wrapper to avoid log noise on
   * expected NotFound outcomes) and classifies the result.
   */
  private async checkAsset(params: {
    projectId: string;
    assetId: string;
    allowedMimeTypes: string[] | null;
    location: EntryReferenceIssueLocation;
    issues: EntryReferenceIssue[];
  }): Promise<void> {
    const { projectId, assetId, allowedMimeTypes, location, issues } = params;
    try {
      const assetFile = await this.jsonFileService.read(
        this.pathTo.assetFile(projectId, assetId),
        assetFileSchema
      );
      if (
        allowedMimeTypes !== null &&
        allowedMimeTypes.length > 0 &&
        !allowedMimeTypes.includes(assetFile.mimeType)
      ) {
        issues.push({
          kind: 'asset_mime_mismatch',
          ...location,
          assetId,
          expectedMimeTypes: allowedMimeTypes,
          actualMimeType: assetFile.mimeType,
        });
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        issues.push({
          kind: 'reference_not_found',
          ...location,
          refKind: 'asset',
          refId: assetId,
          collectionId: null,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Reads an Entry's file directly via JsonFileService (bypassing
   * `EntryService.read`'s `validated()` wrapper to avoid log noise on
   * expected NotFound outcomes) and classifies the result.
   */
  private async checkEntry(params: {
    projectId: string;
    collectionId: string;
    entryId: string;
    location: EntryReferenceIssueLocation;
    issues: EntryReferenceIssue[];
  }): Promise<void> {
    const { projectId, collectionId, entryId, location, issues } = params;
    try {
      await this.jsonFileService.read(
        this.pathTo.entryFile(projectId, collectionId, entryId),
        entryFileSchema
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        issues.push({
          kind: 'reference_not_found',
          ...location,
          refKind: 'entry',
          refId: entryId,
          collectionId,
        });
        return;
      }
      throw error;
    }
  }
}

//
// Helpers for cross-entity reference scanning
//

/**
 * `CoreError.notFound` predicate. `JsonFileService.readFile` raises
 * `CoreError.notFound` directly for an absent file, rather than letting an
 * ENOENT through `CoreError.fromUnknown`.
 *
 * Both callers read through `jsonFileService`, so the `ENOENT` branch below
 * is a defensive leftover rather than the one that fires.
 */
function isNotFoundError(error: unknown): boolean {
  if (error instanceof CoreError && error.type === 'NotFound') {
    return true;
  }
  // Node's fs errors carry a `code` property.
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  ) {
    return true;
  }
  return false;
}

/**
 * The one mdast carrier every gate walks: the write gate directly, the delete
 * and sync gates through `collectReferencesInValue`.
 *
 * It returns every `entryReference` and `assetReference` node along with its
 * `treePath`, the sequence of `children` indices from the root. Hand-rolled
 * because the unist visitor APIs do not hand that path back.
 */
function collectMdAstRefs(root: MdAstRoot): Array<{
  node: MdAstEntryReference | MdAstAssetReference;
  treePath: number[];
}> {
  const result: Array<{
    node: MdAstEntryReference | MdAstAssetReference;
    treePath: number[];
  }> = [];

  function isMdAstNode(value: unknown): value is { type: string } {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  function isEntryReference(node: {
    type: string;
  }): node is MdAstEntryReference {
    return node.type === 'entryReference';
  }

  function isAssetReference(node: {
    type: string;
  }): node is MdAstAssetReference {
    return node.type === 'assetReference';
  }

  function hasChildren(node: {
    type: string;
  }): node is { type: string; children: unknown[] } {
    if (!('children' in node)) return false;
    const { children } = node as { children: unknown };
    return Array.isArray(children);
  }

  function walk(node: unknown, path: number[]): void {
    if (!isMdAstNode(node)) return;
    if (isEntryReference(node) || isAssetReference(node)) {
      result.push({ node, treePath: path });
    }
    if (hasChildren(node)) {
      for (let i = 0; i < node.children.length; i += 1) {
        walk(node.children[i], [...path, i]);
      }
    }
  }

  walk(root, []);
  return result;
}

/**
 * What a reference search targets: a single Asset, a single Entry, or a whole
 * Collection. The Collection variant (used by Collection delete) matches any
 * reference pointing into it, plus a direct reference to the Collection itself.
 */
type ReferenceTarget =
  | { projectId: string; assetId: Uuid }
  | { projectId: string; collectionId: Uuid; entryId: Uuid }
  | { projectId: string; collectionId: Uuid };

/**
 * A single Asset, Entry or Collection reference found somewhere inside an
 * Entry's values, together with where it lives. The leaf carrier (`via`) is
 * always a flat `reference` field or an `mdast` node. Nesting inside
 * `dynamic`/component blocks is captured by a non-empty `componentPath`, not
 * by `via`.
 */
type FoundReference = {
  refKind: 'asset' | 'entry' | 'collection';
  id: Uuid;
  /** Present for entry references (carried for path resolution). */
  collectionId?: Uuid;
  fieldSlug: string;
  via: 'reference' | 'mdast';
  componentPath: ReferenceComponentPathSegment[];
  language: SupportedLanguage;
  treePath: number[];
  index: number | null;
};

/**
 * Recursively collects every Asset and Entry reference held by a single
 * `Value`, descending through `dynamic` and component items so nested
 * references are not missed.
 *
 * Shared by the delete gate and the sync scan, the two that walk values
 * without field definitions. `componentPath` carries the chain of hops
 * already traversed.
 *
 * @see ../../contributing/reference-integrity.md
 */
function collectReferencesInValue(
  value: Value,
  fieldSlug: string,
  componentPath: ReferenceComponentPathSegment[]
): FoundReference[] {
  const result: FoundReference[] = [];

  if (value.valueType === 'reference') {
    for (const [lang, refs] of entriesOf(value.content)) {
      if (!refs) continue;
      for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index];
        if (!ref) continue;
        if (ref.objectType === 'asset') {
          result.push({
            refKind: 'asset',
            id: ref.id,
            fieldSlug,
            via: 'reference',
            componentPath,
            language: lang,
            treePath: [],
            index,
          });
        } else if (ref.objectType === 'entry') {
          result.push({
            refKind: 'entry',
            id: ref.id,
            collectionId: ref.collectionId,
            fieldSlug,
            via: 'reference',
            componentPath,
            language: lang,
            treePath: [],
            index,
          });
        } else if (ref.objectType === 'collection') {
          // A reference to a Collection as a whole. No field type produces one
          // today, so this is a defensive branch that keeps Collection delete
          // from stranding such a reference. Its `id` is the Collection's id.
          result.push({
            refKind: 'collection',
            id: ref.id,
            fieldSlug,
            via: 'reference',
            componentPath,
            language: lang,
            treePath: [],
            index,
          });
        }
      }
    }
  } else if (value.valueType === 'mdast') {
    for (const [lang, root] of entriesOf(value.content)) {
      if (!root) continue;
      for (const { node, treePath } of collectMdAstRefs(root)) {
        if (node.type === 'assetReference') {
          result.push({
            refKind: 'asset',
            id: node.assetId,
            fieldSlug,
            via: 'mdast',
            componentPath,
            language: lang,
            treePath,
            index: null,
          });
        } else {
          result.push({
            refKind: 'entry',
            id: node.entryId,
            collectionId: node.collectionId,
            fieldSlug,
            via: 'mdast',
            componentPath,
            language: lang,
            treePath,
            index: null,
          });
        }
      }
    }
  } else if (value.valueType === 'component') {
    for (const item of value.content) {
      const segment: ReferenceComponentPathSegment = {
        fieldSlug,
        itemId: item.id,
        componentId: item.componentId,
      };
      for (const [innerSlug, innerValue] of Object.entries(item.values)) {
        result.push(
          ...collectReferencesInValue(innerValue, innerSlug, [
            ...componentPath,
            segment,
          ])
        );
      }
    }
  }

  return result;
}
