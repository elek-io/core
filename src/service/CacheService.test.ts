import { describe, expect, it, onTestFinished } from 'vitest';
import core from '../test/setup.js';
import {
  createCollection,
  createComponent,
  createProject,
} from '../test/util.js';

/**
 * A git command that rewrites a working tree under a running Core has to
 * clear every cache that mirrors it, the slug indexes as well as the file
 * cache. A hard reset stands in for all of them, since a pull, a rebase or
 * a switch clears through the same `CacheService`.
 */
describe('caches after git rewrites the working tree', function () {
  async function projectWithRenamedCollection() {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    await core.collections.update({
      projectId: project.id,
      id: collection.id,
      icon: collection.icon,
      name: collection.name,
      description: collection.description,
      fieldDefinitions: collection.fieldDefinitions,
      slug: { singular: 'article', plural: 'articles' },
    });
    // Back to the commit before the rename, so "products" is on disk again
    await core.git.reset(
      core.util.pathTo.project(project.id),
      'hard',
      'HEAD~1'
    );
    return { project, collection };
  }

  async function projectWithRenamedComponent() {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const component = await createComponent(project.id);
    await core.components.update({
      projectId: project.id,
      id: component.id,
      name: component.name,
      description: component.description,
      fieldDefinitions: component.fieldDefinitions,
      slug: 'banner',
    });
    // Back to the commit before the rename, so "hero" is on disk again
    await core.git.reset(
      core.util.pathTo.project(project.id),
      'hard',
      'HEAD~1'
    );
    return { project, component };
  }

  it('resolves a Collection slug against the tree the reset left behind', async function () {
    const { project, collection } = await projectWithRenamedCollection();

    await expect(
      core.collections.readBySlug({ projectId: project.id, slug: 'articles' })
    ).rejects.toMatchObject({ type: 'NotFound' });
    const products = await core.collections.readBySlug({
      projectId: project.id,
      slug: 'products',
    });
    expect(products.id).toBe(collection.id);
  }, 60000);

  it('keeps a Collection slug unique against the tree the reset left behind', async function () {
    const { project } = await projectWithRenamedCollection();

    await expect(createCollection(project.id)).rejects.toMatchObject({
      type: 'Conflict',
    });
  }, 60000);

  it('resolves a Component slug against the tree the reset left behind', async function () {
    const { project, component } = await projectWithRenamedComponent();

    await expect(
      core.components.readBySlug({ projectId: project.id, slug: 'banner' })
    ).rejects.toMatchObject({ type: 'NotFound' });
    const hero = await core.components.readBySlug({
      projectId: project.id,
      slug: 'hero',
    });
    expect(hero.id).toBe(component.id);
  }, 60000);

  it('keeps a Component slug unique against the tree the reset left behind', async function () {
    const { project } = await projectWithRenamedComponent();

    await expect(createComponent(project.id)).rejects.toMatchObject({
      type: 'Conflict',
    });
  }, 60000);
});
