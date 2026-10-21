import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, {
  CoreError,
  flattenFieldDefinitions,
  uuid,
  type ContentLossIssue,
  type EntryIssue,
  type FieldDefinition,
  type Project,
} from '../test/setup.js';
import {
  createProject,
  ensureCleanGitStatus,
  execGit,
  getFileHash,
} from '../test/util.js';

/**
 * Removing a field definition, and narrowing an `ofComponents` or an
 * `ofCollections`, each deleted stored content from every Entry and
 * committed it without telling the caller. Core refuses them now and names
 * what would go, and the caller accepts the loss by field definition id.
 *
 * @see ../../docs/schema-changes.md
 */
describe('a model change that deletes content is refused', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('Content loss guard');
  }, 60000);

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  function textField(id: string, slug: string): FieldDefinition {
    return {
      id,
      slug,
      valueType: 'string',
      fieldType: 'text',
      label: { en: slug, de: slug },
      description: null,
      defaultValue: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    };
  }

  function requiredTextField(id: string, slug: string): FieldDefinition {
    return {
      id,
      slug,
      valueType: 'string',
      fieldType: 'text',
      label: { en: slug, de: slug },
      description: null,
      defaultValue: null,
      isRequired: true,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    };
  }

  /** A Collection of two text fields, holding one Entry with both filled. */
  async function collectionWithTwoFields(content = 'Written by hand') {
    const keptId = uuid();
    const goneId = uuid();
    const suffix = uuid();
    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      description: { en: 'Articles', de: 'Articles' },
      slug: { singular: `article-${suffix}`, plural: `articles-${suffix}` },
      fieldDefinitions: [textField(keptId, 'title'), textField(goneId, 'note')],
    });
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Title', de: 'Titel' },
        },
        note: {
          objectType: 'value',
          valueType: 'string',
          content: { en: content, de: content },
        },
      },
    });

    return { collection, entry, keptId, goneId };
  }

  /** The update that removes the `note` field definition. */
  function withoutNote(
    collection: { id: string; slug: { singular: string; plural: string } },
    keptId: string
  ) {
    return {
      projectId: project.id,
      id: collection.id,
      icon: 'home' as const,
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      description: { en: 'Articles', de: 'Articles' },
      slug: collection.slug,
      fieldDefinitions: [textField(keptId, 'title')],
    };
  }

  async function refusalOf(call: Promise<unknown>): Promise<CoreError> {
    const error = await call.then(
      () => null,
      (reason: unknown) => reason
    );
    if (error instanceof CoreError === false) {
      throw new Error(`expected a CoreError, got ${String(error)}`);
    }
    return error;
  }

  it(
    'refuses a removed field definition, before writing anything',
    { timeout: 60000 },
    async function () {
      const { collection, entry, keptId, goneId } =
        await collectionWithTwoFields();
      const before = await snapshot(project.id);

      const error = await refusalOf(
        core.collections.update(withoutNote(collection, keptId))
      );

      expect(error.type).toBe('Conflict');
      const issues = contentLossIssues(error);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.reason).toBe('field_removed');
      expect(issues[0]!.entryId).toBe(entry.id);
      expect(issues[0]!.collectionId).toBe(collection.id);
      expect(issues[0]!.fieldDefinitionId).toBe(goneId);
      expect(issues[0]!.fieldSlug).toBe('note');
      expect(issues[0]!.currentValue).toEqual({
        objectType: 'value',
        valueType: 'string',
        content: { en: 'Written by hand', de: 'Written by hand' },
      });

      expect(await snapshot(project.id)).toEqual(before);
      const kept = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(kept.values['note']).toBeDefined();
    }
  );

  it(
    'applies the same update once the caller accepts the loss',
    { timeout: 60000 },
    async function () {
      const { collection, entry, keptId, goneId } =
        await collectionWithTwoFields();
      const commitsBefore = await commitCount(project.id);

      await core.collections.update({
        ...withoutNote(collection, keptId),
        acceptedContentLoss: [goneId],
      });

      const updated = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(updated.values['note']).toBeUndefined();
      expect(updated.values['title']).toBeDefined();
      expect(await commitCount(project.id)).toBe(commitsBefore + 1);
    }
  );

  it(
    'still refuses a plain retry, and one naming another field definition',
    { timeout: 60000 },
    async function () {
      const { collection, keptId } = await collectionWithTwoFields();

      await refusalOf(core.collections.update(withoutNote(collection, keptId)));
      const retry = await refusalOf(
        core.collections.update(withoutNote(collection, keptId))
      );
      expect(contentLossIssues(retry)).toHaveLength(1);

      const wrongId = await refusalOf(
        core.collections.update({
          ...withoutNote(collection, keptId),
          acceptedContentLoss: [keptId, uuid()],
        })
      );
      expect(contentLossIssues(wrongId)).toHaveLength(1);

      // Nothing outside the call turns the guard off
      expect(JSON.stringify(core.options)).not.toContain('ontentLoss');
      const settings = await core.projects.read({ id: project.id });
      expect(JSON.stringify(settings)).not.toContain('ontentLoss');
    }
  );

  it(
    'carries a caller through the documented workflow in one retry',
    { timeout: 60000 },
    async function () {
      const { collection, entry, keptId, goneId } =
        await collectionWithTwoFields();
      const addedId = uuid();
      const update = {
        ...withoutNote(collection, keptId),
        fieldDefinitions: [
          textField(keptId, 'title'),
          requiredTextField(addedId, 'teaser'),
        ],
      };

      const error = await refusalOf(core.collections.update(update));

      // What the doc tells a caller to do with error.cause, verbatim
      const issues: EntryIssue[] = contentLossIssues(error).length
        ? (error.cause as EntryIssue[])
        : [];
      const resolutions: Record<
        string,
        Record<
          string,
          {
            objectType: 'value';
            valueType: 'string';
            content: Record<string, string>;
          }
        >
      > = {};
      for (const issue of issues) {
        if (issue.issue === 'content_loss') continue;
        resolutions[issue.entryId] ??= {};
        resolutions[issue.entryId]![issue.fieldSlug] = {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Teaser', de: 'Teaser' },
        };
      }

      await core.collections.update({
        ...update,
        resolutions,
        acceptedContentLoss: issues
          .filter((issue) => issue.issue === 'content_loss')
          .map((issue) => issue.fieldDefinitionId),
      });

      const applied = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(applied.values['note']).toBeUndefined();
      expect(applied.values['teaser']).toBeDefined();
      expect(goneId).not.toBe(addedId);
    }
  );

  it(
    'refuses a narrowed ofComponents and a narrowed ofCollections, naming what goes',
    { timeout: 120000 },
    async function () {
      const other = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Note', de: 'Note' },
          plural: { en: 'Notes', de: 'Notes' },
        },
        description: { en: 'Notes', de: 'Notes' },
        slug: { singular: `note-${uuid()}`, plural: `notes-${uuid()}` },
        fieldDefinitions: [textField(uuid(), 'title')],
      });
      const otherEntry = await core.entries.create({
        projectId: project.id,
        collectionId: other.id,
        values: {
          title: {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'Linked', de: 'Verlinkt' },
          },
        },
      });

      const component = await core.components.create({
        projectId: project.id,
        name: { en: 'Quote', de: 'Quote' },
        slug: `quote-${uuid()}`,
        description: null,
        fieldDefinitions: [textField(uuid(), 'body')],
      });
      // The allowlists narrow onto these two, which exist but hold nothing
      const allowedComponent = await core.components.create({
        projectId: project.id,
        name: { en: 'Aside', de: 'Aside' },
        slug: `aside-${uuid()}`,
        description: null,
        fieldDefinitions: [textField(uuid(), 'body')],
      });

      const blocksId = uuid();
      const relatedId = uuid();
      const suffix = uuid();
      const page = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Page', de: 'Page' },
          plural: { en: 'Pages', de: 'Pages' },
        },
        description: { en: 'Pages', de: 'Pages' },
        slug: { singular: `page-${suffix}`, plural: `pages-${suffix}` },
        fieldDefinitions: [
          {
            id: blocksId,
            slug: 'blocks',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Blocks', de: 'Blocks' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [component.id],
            min: null,
            max: null,
          },
          {
            id: relatedId,
            slug: 'related',
            valueType: 'reference',
            fieldType: 'entry',
            label: { en: 'Related', de: 'Related' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofCollections: [other.id],
            min: null,
            max: null,
          },
        ],
      });
      const pageEntry = await core.entries.create({
        projectId: project.id,
        collectionId: page.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: uuid(),
                componentId: component.id,
                values: {
                  body: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: 'Quoted', de: 'Zitiert' },
                  },
                },
              },
            ],
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: {
              en: [
                {
                  objectType: 'entry',
                  id: otherEntry.id,
                  collectionId: other.id,
                },
              ],
              de: [],
            },
          },
        },
      });

      const narrowed = {
        projectId: project.id,
        id: page.id,
        icon: 'home' as const,
        name: {
          singular: { en: 'Page', de: 'Page' },
          plural: { en: 'Page', de: 'Page' },
        },
        description: { en: 'Pages', de: 'Pages' },
        slug: page.slug,
        fieldDefinitions: page.fieldDefinitions.map((definition) =>
          definition.id === blocksId
            ? { ...definition, ofComponents: [allowedComponent.id] }
            : { ...definition, ofCollections: [page.id] }
        ),
      };
      const before = await snapshot(project.id);

      const error = await refusalOf(core.collections.update(narrowed));

      const issues = contentLossIssues(error);
      expect(issues).toHaveLength(2);
      const components = issues.find(
        (issue) => issue.reason === 'components_narrowed'
      );
      const collections = issues.find(
        (issue) => issue.reason === 'collections_narrowed'
      );
      if (
        components?.reason !== 'components_narrowed' ||
        collections?.reason !== 'collections_narrowed'
      ) {
        throw new Error('expected one loss per narrowed allowlist');
      }
      expect(components.fieldDefinitionId).toBe(blocksId);
      expect(components.itemCount).toBe(1);
      expect(components.currentValue.content[0]!.componentId).toBe(
        component.id
      );
      expect(collections.fieldDefinitionId).toBe(relatedId);
      expect(collections.language).toBe('en');
      expect(collections.itemCount).toBe(1);
      expect(await snapshot(project.id)).toEqual(before);

      await core.collections.update({
        ...narrowed,
        acceptedContentLoss: [blocksId, relatedId],
      });
      const applied = await core.entries.read({
        projectId: project.id,
        collectionId: page.id,
        id: pageEntry.id,
      });
      const blocks = applied.values['blocks'];
      const related = applied.values['related'];
      expect(blocks?.valueType === 'component' && blocks.content).toEqual([]);
      expect(related?.valueType === 'reference' && related.content.en).toEqual(
        []
      );
    }
  );

  it(
    'refuses a removed Component field definition, at the top level and nested',
    { timeout: 120000 },
    async function () {
      const keptId = uuid();
      const goneId = uuid();
      const inner = await core.components.create({
        projectId: project.id,
        name: { en: 'Inner', de: 'Inner' },
        slug: `inner-${uuid()}`,
        description: null,
        fieldDefinitions: [
          textField(keptId, 'kept'),
          textField(goneId, 'gone'),
        ],
      });
      const outer = await core.components.create({
        projectId: project.id,
        name: { en: 'Outer', de: 'Outer' },
        slug: `outer-${uuid()}`,
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'inner',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Inner', de: 'Inner' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [inner.id],
            min: null,
            max: null,
          },
        ],
      });

      const suffix = uuid();
      const page = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Section', de: 'Section' },
          plural: { en: 'Sections', de: 'Sections' },
        },
        description: { en: 'Sections', de: 'Sections' },
        slug: { singular: `section-${suffix}`, plural: `sections-${suffix}` },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'blocks',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Blocks', de: 'Blocks' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [inner.id, outer.id],
            min: null,
            max: null,
          },
        ],
      });

      const topItemId = uuid();
      const nestedItemId = uuid();
      const filled = (text: string) => ({
        kept: {
          objectType: 'value' as const,
          valueType: 'string' as const,
          content: { en: 'Kept', de: 'Kept' },
        },
        gone: {
          objectType: 'value' as const,
          valueType: 'string' as const,
          content: { en: text, de: text },
        },
      });
      await core.entries.create({
        projectId: project.id,
        collectionId: page.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: topItemId,
                componentId: inner.id,
                values: filled('At the top'),
              },
              {
                id: uuid(),
                componentId: outer.id,
                values: {
                  inner: {
                    objectType: 'value',
                    valueType: 'component',
                    content: [
                      {
                        id: nestedItemId,
                        componentId: inner.id,
                        values: filled('Nested'),
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      });

      const withoutGone = {
        projectId: project.id,
        id: inner.id,
        name: inner.name,
        slug: inner.slug,
        description: inner.description,
        fieldDefinitions: [textField(keptId, 'kept')],
      };
      const before = await snapshot(project.id);

      const error = await refusalOf(core.components.update(withoutGone));

      const issues = contentLossIssues(error);
      expect(issues).toHaveLength(2);
      expect(
        issues.map((issue) => issue.componentItemId).toSorted(compare)
      ).toEqual([topItemId, nestedItemId].toSorted(compare));
      for (const issue of issues) {
        expect(issue.reason).toBe('field_removed');
        expect(issue.fieldDefinitionId).toBe(goneId);
        expect(issue.fieldSlug).toBe('gone');
      }
      expect(await snapshot(project.id)).toEqual(before);

      await core.components.update({
        ...withoutGone,
        acceptedContentLoss: [goneId],
      });
      expect(await snapshot(project.id)).not.toEqual(before);
    }
  );

  it(
    'answers the same way through both services, and reports the resolutions in the same list',
    { timeout: 60000 },
    async function () {
      const goneId = uuid();
      const component = await core.components.create({
        projectId: project.id,
        name: { en: 'Card', de: 'Card' },
        slug: `card-${uuid()}`,
        description: null,
        fieldDefinitions: [textField(goneId, 'note')],
      });
      const suffix = uuid();
      const cards = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Card', de: 'Card' },
          plural: { en: 'Cards', de: 'Cards' },
        },
        description: { en: 'Cards', de: 'Cards' },
        slug: { singular: `card-${suffix}`, plural: `cards-${suffix}` },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'blocks',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Blocks', de: 'Blocks' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [component.id],
            min: null,
            max: null,
          },
        ],
      });
      await core.entries.create({
        projectId: project.id,
        collectionId: cards.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: uuid(),
                componentId: component.id,
                values: {
                  note: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: 'Noted', de: 'Notiert' },
                  },
                },
              },
            ],
          },
        },
      });

      const plain = await collectionWithTwoFields();
      const throughCollection = await refusalOf(
        core.collections.update(withoutNote(plain.collection, plain.keptId))
      );
      const throughComponent = await refusalOf(
        core.components.update({
          projectId: project.id,
          id: component.id,
          name: component.name,
          slug: component.slug,
          description: component.description,
          fieldDefinitions: [],
        })
      );

      expect(throughComponent.type).toBe(throughCollection.type);
      expect(throughComponent.message).toBe(throughCollection.message);
      expect(
        Object.keys(contentLossIssues(throughComponent)[0]!).toSorted(compare)
      ).toEqual(
        Object.keys(contentLossIssues(throughCollection)[0]!)
          .concat('componentItemId')
          .toSorted(compare)
      );

      // One call reports the loss and the Values to resolve together
      const both = await refusalOf(
        core.components.update({
          projectId: project.id,
          id: component.id,
          name: component.name,
          slug: component.slug,
          description: component.description,
          fieldDefinitions: [requiredTextField(uuid(), 'headline')],
        })
      );
      expect(Array.isArray(both.cause)).toBe(true);
      const kinds = (Array.isArray(both.cause) ? both.cause : []).map(
        (issue: { issue: string }) => issue.issue
      );
      expect(kinds).toContain('content_loss');
      expect(kinds).toContain('missing_required');
      expect(both.message).toContain('require entry resolutions');
    }
  );

  it(
    'applies an update that drops nothing, without an acceptance',
    { timeout: 120000 },
    async function () {
      const keptId = uuid();
      const goneId = uuid();
      const suffix = uuid();
      const collection = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Draft', de: 'Draft' },
          plural: { en: 'Drafts', de: 'Drafts' },
        },
        description: { en: 'Drafts', de: 'Drafts' },
        slug: { singular: `draft-${suffix}`, plural: `drafts-${suffix}` },
        fieldDefinitions: [
          textField(keptId, 'title'),
          textField(goneId, 'note'),
        ],
      });
      // No Entry at all, so the removal drops nothing
      await core.collections.update({
        projectId: project.id,
        id: collection.id,
        icon: 'home',
        name: collection.name,
        description: collection.description,
        slug: collection.slug,
        fieldDefinitions: [
          textField(keptId, 'title'),
          textField(goneId, 'note'),
        ],
      });

      await core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: {
          title: {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'Title', de: 'Titel' },
          },
          note: {
            objectType: 'value',
            valueType: 'string',
            content: { en: null, de: null },
          },
        },
      });

      // A renamed slug, an added field and a field no Entry filled in
      const addedId = uuid();
      const applied = await core.collections.update({
        projectId: project.id,
        id: collection.id,
        icon: 'home',
        name: collection.name,
        description: collection.description,
        slug: collection.slug,
        fieldDefinitions: [
          textField(keptId, 'headline'),
          textField(addedId, 'teaser'),
        ],
      });

      expect(
        flattenFieldDefinitions(applied.fieldDefinitions).map(
          (definition) => definition.slug
        )
      ).toEqual(['headline', 'teaser']);
    }
  );

  it(
    'keeps what a User typed out of the log files on the refusal path',
    { timeout: 60000 },
    async function () {
      const canary = 'zqx-canary-6b1f03-refused-note';
      const { collection, keptId } = await collectionWithTwoFields(canary);

      const error = await refusalOf(
        core.collections.update(withoutNote(collection, keptId))
      );
      expect(error.message).not.toContain(canary);

      expect(await readLogs()).not.toContain(canary);
    }
  );
});

/** Narrows one element of a `Conflict`'s cause without asserting its shape. */
function isEntryIssue(candidate: unknown): candidate is EntryIssue {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'issue' in candidate &&
    'fieldDefinitionId' in candidate
  );
}

/** A stable order for comparing two lists of ids, slugs or paths. */
function compare(a: string | undefined, b: string | undefined): number {
  return String(a).localeCompare(String(b));
}

/**
 * The content loss refusals a `Conflict` carries, read the way a consumer
 * reads them: branch on `issue`, never on the message.
 */
function contentLossIssues(error: CoreError): ContentLossIssue[] {
  if (!Array.isArray(error.cause)) {
    throw new Error(`expected an issue list, got ${String(error.cause)}`);
  }
  const issues: EntryIssue[] = error.cause.map((issue: unknown) => {
    if (isEntryIssue(issue) === false) {
      throw new Error(`expected an issue, got ${String(issue)}`);
    }
    return issue;
  });
  return issues.filter((issue) => issue.issue === 'content_loss');
}

/** Every file of the Project by hash, plus the commit it sits on. */
async function snapshot(projectId: string): Promise<string> {
  const projectPath = core.util.pathTo.project(projectId);
  const head = await execGit(projectPath, ['rev-parse', 'HEAD']);
  const status = await execGit(projectPath, ['status', '--porcelain']);
  const files: string[] = [];
  for (const file of await listFiles(projectPath)) {
    files.push(
      `${Path.relative(projectPath, file)} ${await getFileHash(file)}`
    );
  }
  return [head, status, ...files.toSorted(compare)].join('\n');
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await Fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = Path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git') {
        continue;
      }
      files.push(...(await listFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function commitCount(projectId: string): Promise<number> {
  const output = await execGit(core.util.pathTo.project(projectId), [
    'rev-list',
    '--count',
    'HEAD',
  ]);
  return Number(output);
}

async function readLogs(): Promise<string> {
  const dir = core.util.pathTo.logs;
  if (!(await Fs.pathExists(dir))) {
    return '';
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );
  return contents.join('\n');
}
