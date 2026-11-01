import {
  afterAll,
  afterEach,
  assert,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import core, {
  CoreError,
  uuid,
  type EntryIssue,
  type FieldDefinition,
  type Project,
  type Value,
} from '../test/setup.js';
import { createProject, ensureCleanGitStatus } from '../test/util.js';

/**
 * A Component's field definition change raises its issues per Component
 * item, so the resolution answering one names the item it belongs to. It
 * used to land at the Entry's top level instead, which left the item
 * without its Value and overwrote an Entry field of the same slug.
 *
 * @see ../../docs/schema-changes.md
 */
describe('a Component resolution lands in the item it names', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('Component item resolutions');
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  function textField(
    id: string,
    slug: string,
    isRequired = false
  ): FieldDefinition {
    return {
      id,
      slug,
      valueType: 'string',
      fieldType: 'text',
      label: { en: slug, de: slug },
      description: null,
      defaultValue: null,
      isRequired,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    };
  }

  function dynamicField(
    id: string,
    slug: string,
    ofComponents: string[]
  ): FieldDefinition {
    return {
      id,
      slug,
      valueType: 'component',
      fieldType: 'dynamic',
      label: { en: slug, de: slug },
      description: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      ofComponents,
      min: null,
      max: null,
    };
  }

  function text(content: string): Value {
    return {
      objectType: 'value',
      valueType: 'string',
      content: { en: content, de: content },
    };
  }

  async function component(fieldDefinitions: FieldDefinition[]) {
    return core.components.create({
      projectId: project.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: `hero-${uuid()}`,
      description: null,
      fieldDefinitions,
    });
  }

  async function collection(fieldDefinitions: FieldDefinition[]) {
    const suffix = uuid();
    return core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Page', de: 'Page' },
        plural: { en: 'Pages', de: 'Pages' },
      },
      description: { en: 'Pages', de: 'Pages' },
      slug: { singular: `page-${suffix}`, plural: `pages-${suffix}` },
      fieldDefinitions,
    });
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

  /**
   * The Entry's stored values, read back through the Collection's schema.
   */
  async function valuesOf(
    collectionId: string,
    entryId: string
  ): Promise<Record<string, Value>> {
    const entry = await core.entries.read({
      projectId: project.id,
      collectionId,
      id: entryId,
    });
    return entry.values;
  }

  /** The item carrying `itemId`, found under `blocks` at any depth. */
  function itemOf(
    values: Record<string, Value>,
    itemId: string
  ): Record<string, Value> {
    for (const value of Object.values(values)) {
      if (value.valueType !== 'component') continue;
      for (const item of value.content) {
        if (item.id === itemId) return item.values;
        const nested = itemOf(item.values, itemId);
        if (Object.keys(nested).length > 0) return nested;
      }
    }
    return {};
  }

  /**
   * One hero Component with a `title`, a Collection holding it under
   * `blocks` plus whatever own fields are given, and one Entry per set of
   * items.
   */
  async function hero(options?: {
    collectionFields?: FieldDefinition[];
    entryValues?: Record<string, Value>;
  }) {
    const titleId = uuid();
    const heroComponent = await component([textField(titleId, 'title', true)]);
    const pages = await collection([
      dynamicField(uuid(), 'blocks', [heroComponent.id]),
      ...(options?.collectionFields ?? []),
    ]);
    const subtitleId = uuid();

    /** The same Component plus a required `subtitle` with no default. */
    const withSubtitle = {
      projectId: project.id,
      id: heroComponent.id,
      name: heroComponent.name,
      slug: heroComponent.slug,
      description: heroComponent.description,
      fieldDefinitions: [
        textField(titleId, 'title', true),
        textField(subtitleId, 'subtitle', true),
      ],
    };

    return { heroComponent, pages, withSubtitle };
  }

  /** One hero item of the given Component, holding a `title`. */
  function heroItem(componentId: string, title: string) {
    return {
      id: uuid(),
      componentId,
      values: { title: text(title) },
    };
  }

  /**
   * The resolutions the documented workflow builds from a refusal: the Entry
   * id, then the Component item id, then the field slug.
   */
  function resolutionsFor(
    error: CoreError,
    value: (issue: EntryIssue) => Value
  ): Record<string, Record<string, Record<string, Value>>> {
    const issues = Array.isArray(error.cause)
      ? (error.cause as EntryIssue[])
      : [];
    const resolutions: Record<
      string,
      Record<string, Record<string, Value>>
    > = {};
    for (const issue of issues) {
      if (issue.issue === 'content_loss') continue;
      assert(issue.componentItemId !== undefined);
      resolutions[issue.entryId] ??= {};
      resolutions[issue.entryId]![issue.componentItemId] ??= {};
      resolutions[issue.entryId]![issue.componentItemId]![issue.fieldSlug] =
        value(issue);
    }
    return resolutions;
  }

  it('fills the item the issue names and leaves the Project upgradable', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });

    const refusal = await refusalOf(core.components.update(withSubtitle));
    expect(refusal.type).toBe('Conflict');

    await core.components.update({
      ...withSubtitle,
      resolutions: resolutionsFor(refusal, () => text('Hero subtitle')),
    });

    const values = await valuesOf(pages.id, entry.id);
    // The Value lands in the item, and the Entry gains no key of its own
    expect(Object.keys(values)).toEqual(['blocks']);
    expect(itemOf(values, item.id)['subtitle']).toEqual(text('Hero subtitle'));

    await expect(
      core.projects.upgrade({ id: project.id, force: true })
    ).resolves.toBeUndefined();
  });

  it('leaves an Entry field of the same slug as the Component field alone', async function () {
    const { heroComponent, pages, withSubtitle } = await hero({
      collectionFields: [textField(uuid(), 'subtitle', true)],
    });
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
        subtitle: text('The page subtitle the editor wrote'),
      },
    });

    const refusal = await refusalOf(core.components.update(withSubtitle));
    await core.components.update({
      ...withSubtitle,
      resolutions: resolutionsFor(refusal, () =>
        text('Hero subtitle meant for the item')
      ),
    });

    const values = await valuesOf(pages.id, entry.id);
    expect(values['subtitle']).toEqual(
      text('The page subtitle the editor wrote')
    );
    expect(itemOf(values, item.id)['subtitle']).toEqual(
      text('Hero subtitle meant for the item')
    );
  });

  it('gives two items of one Component in one Entry their own resolution', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const first = heroItem(heroComponent.id, 'First');
    const second = heroItem(heroComponent.id, 'Second');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [first, second],
        },
      },
    });

    const refusal = await refusalOf(core.components.update(withSubtitle));
    await core.components.update({
      ...withSubtitle,
      resolutions: {
        [entry.id]: {
          [first.id]: { subtitle: text('For the first') },
          [second.id]: { subtitle: text('For the second') },
        },
      },
    });

    const values = await valuesOf(pages.id, entry.id);
    expect(itemOf(values, first.id)['subtitle']).toEqual(text('For the first'));
    expect(itemOf(values, second.id)['subtitle']).toEqual(
      text('For the second')
    );
    expect(refusal.type).toBe('Conflict');
  });

  it('refuses the update while one of two items is unresolved, writing nothing', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const resolved = heroItem(heroComponent.id, 'First');
    const unresolved = heroItem(heroComponent.id, 'Second');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [resolved, unresolved],
        },
      },
    });
    const before = await valuesOf(pages.id, entry.id);

    const refusal = await refusalOf(
      core.components.update({
        ...withSubtitle,
        resolutions: {
          [entry.id]: { [resolved.id]: { subtitle: text('For the first') } },
        },
      })
    );

    expect(refusal.type).toBe('Conflict');
    const issues = Array.isArray(refusal.cause) ? refusal.cause : [];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issue: 'missing_required',
      componentItemId: unresolved.id,
      entryId: entry.id,
    });
    expect(await valuesOf(pages.id, entry.id)).toEqual(before);
  });

  it('reaches an item nested inside another item, at any depth', async function () {
    const titleId = uuid();
    const heroComponent = await component([textField(titleId, 'title', true)]);
    const middle = await component([
      dynamicField(uuid(), 'nested', [heroComponent.id]),
    ]);
    const outer = await component([
      dynamicField(uuid(), 'middle', [middle.id]),
    ]);
    const pages = await collection([
      dynamicField(uuid(), 'blocks', [heroComponent.id, outer.id]),
    ]);

    const shallow = heroItem(heroComponent.id, 'Shallow');
    const deep = heroItem(heroComponent.id, 'Deep');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [
            shallow,
            {
              id: uuid(),
              componentId: outer.id,
              values: {
                middle: {
                  objectType: 'value',
                  valueType: 'component',
                  content: [
                    {
                      id: uuid(),
                      componentId: middle.id,
                      values: {
                        nested: {
                          objectType: 'value',
                          valueType: 'component',
                          content: [deep],
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    const subtitleId = uuid();
    const withSubtitle = {
      projectId: project.id,
      id: heroComponent.id,
      name: heroComponent.name,
      slug: heroComponent.slug,
      description: heroComponent.description,
      fieldDefinitions: [
        textField(titleId, 'title', true),
        textField(subtitleId, 'subtitle', true),
      ],
    };

    const refusal = await refusalOf(core.components.update(withSubtitle));
    const issues = Array.isArray(refusal.cause) ? refusal.cause : [];
    expect(issues).toHaveLength(2);

    await core.components.update({
      ...withSubtitle,
      resolutions: {
        [entry.id]: {
          [shallow.id]: { subtitle: text('One deep') },
          [deep.id]: { subtitle: text('Three deep') },
        },
      },
    });

    const values = await valuesOf(pages.id, entry.id);
    expect(itemOf(values, shallow.id)['subtitle']).toEqual(text('One deep'));
    expect(itemOf(values, deep.id)['subtitle']).toEqual(text('Three deep'));
  });

  it('refuses a resolution naming an item the Entry does not hold', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });
    const before = await valuesOf(pages.id, entry.id);
    const strangerId = uuid();

    const error = await refusalOf(
      core.components.update({
        ...withSubtitle,
        resolutions: {
          [entry.id]: { [strangerId]: { subtitle: text('Nowhere') } },
        },
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain(strangerId);
    expect(error.message).not.toContain('Nowhere');
    expect(await valuesOf(pages.id, entry.id)).toEqual(before);
  });

  it('refuses a stale item id in an Entry that raised no issue of its own', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const withItem = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });
    // The second Entry holds no item of the Component, so its own cascade
    // raises no issue and resolves nothing
    const withoutItem = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [],
        },
      },
    });
    const before = await valuesOf(pages.id, withItem.id);
    const strangerId = uuid();

    const error = await refusalOf(
      core.components.update({
        ...withSubtitle,
        resolutions: {
          [withItem.id]: { [item.id]: { subtitle: text('For the item') } },
          [withoutItem.id]: { [strangerId]: { subtitle: text('Nowhere') } },
        },
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain(strangerId);
    expect(error.message).not.toContain('Nowhere');
    // The resolution of the other Entry did not land either
    expect(await valuesOf(pages.id, withItem.id)).toEqual(before);
  });

  it('refuses a resolution naming an Entry the Project does not hold', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });
    const before = await valuesOf(pages.id, entry.id);
    const ghostEntryId = uuid();

    const error = await refusalOf(
      core.components.update({
        ...withSubtitle,
        resolutions: {
          [entry.id]: { [item.id]: { subtitle: text('For the item') } },
          [ghostEntryId]: { [uuid()]: { subtitle: text('Ghost') } },
        },
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain(ghostEntryId);
    expect(error.message).not.toContain('Ghost');
    expect(await valuesOf(pages.id, entry.id)).toEqual(before);
  });

  it('refuses a stale item id although no field definition changes', async function () {
    const { heroComponent, pages } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });
    const strangerId = uuid();

    const error = await refusalOf(
      core.components.update({
        projectId: project.id,
        id: heroComponent.id,
        name: heroComponent.name,
        slug: heroComponent.slug,
        description: heroComponent.description,
        // The same definitions, so nothing cascades at all
        fieldDefinitions: heroComponent.fieldDefinitions,
        resolutions: {
          [entry.id]: { [strangerId]: { title: text('Nowhere') } },
        },
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain(strangerId);
    expect(error.message).not.toContain('Nowhere');
  });

  it('refuses a resolution naming an item of another Component', async function () {
    const titleId = uuid();
    const heroComponent = await component([textField(titleId, 'title', true)]);
    const holder = await component([
      dynamicField(uuid(), 'nested', [heroComponent.id]),
    ]);
    const pages = await collection([
      dynamicField(uuid(), 'blocks', [holder.id]),
    ]);
    const holderItemId = uuid();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [
            {
              id: holderItemId,
              componentId: holder.id,
              values: {
                nested: {
                  objectType: 'value',
                  valueType: 'component',
                  content: [item],
                },
              },
            },
          ],
        },
      },
    });
    const before = await valuesOf(pages.id, entry.id);

    const error = await refusalOf(
      core.components.update({
        projectId: project.id,
        id: heroComponent.id,
        name: heroComponent.name,
        slug: heroComponent.slug,
        description: heroComponent.description,
        fieldDefinitions: [
          textField(titleId, 'title', true),
          textField(uuid(), 'subtitle', true),
        ],
        // The holder item holds the hero item, and declares no `subtitle`
        resolutions: {
          [entry.id]: { [holderItemId]: { subtitle: text('Wrong item') } },
        },
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain(holder.id);
    expect(error.message).not.toContain('Wrong item');
    expect(await valuesOf(pages.id, entry.id)).toEqual(before);
  });

  it('refuses a resolution naming a field the Component does not declare', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });
    const before = await valuesOf(pages.id, entry.id);

    const error = await refusalOf(
      core.components.update({
        ...withSubtitle,
        resolutions: {
          [entry.id]: {
            [item.id]: {
              subtitle: text('Fine'),
              'gone-away': text('Stale'),
            },
          },
        },
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain('gone-away');
    expect(error.message).not.toContain('Stale');
    expect(await valuesOf(pages.id, entry.id)).toEqual(before);
  });

  it('refuses the shape that named the Entry and the field only', async function () {
    const { heroComponent, pages, withSubtitle } = await hero();
    const item = heroItem(heroComponent.id, 'Welcome');
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [item],
        },
      },
    });
    const before = await valuesOf(pages.id, entry.id);

    const error = await refusalOf(
      core.components.update({
        ...withSubtitle,
        // The shape a Collection update takes, one level short of an item
        resolutions: {
          [entry.id]: { subtitle: text('At the top level') },
        } as unknown as Record<string, Record<string, Record<string, Value>>>,
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).not.toContain('At the top level');
    expect(await valuesOf(pages.id, entry.id)).toEqual(before);
  });
});
