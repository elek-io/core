import Elek from '../src/index';
import Project from '../src/project';
import Snapshot from '../src/snapshot';

const elek = new Elek();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let snapshot: Snapshot;

beforeAll(async () => {
  await elek.init();
  project = await elek.project.create('My first project', signature);
});

afterAll(async () => {
  await project.delete();
});

describe('Snapshot module', () => {

  it('should be able to create a new snapshot', async () => {
    snapshot = await project.snapshot.create(signature, 'My first snapshot');
    expect(snapshot.name).toBe('My first snapshot');
  });

  it('should be able to access all snapshots of a project', async () => {
    expect(project.snapshots.length).toBe(1);
  });

  it('should be able to load an existing snapshot', async () => {
    const snapshotAgain = await new Snapshot(project).load(snapshot.id);
    expect(snapshotAgain.name).toContain('My first snapshot');
  });

  it('should be able to revert to an existing snapshot', async () => {
    await project.page.create(signature, 'en-GB');
    await project.page.create(signature, 'de-DE');
    expect(project.pages.length).toBe(3);
    await snapshot.revert(signature);
    expect(project.pages.length).toBe(1);
  });

  it('should be able to work normaly after an revert', async () => {
    await project.page.create(signature, 'en-GB');
    await project.page.create(signature, 'de-DE');
    expect(project.pages.length).toBe(3);
  });

  it('should be able to delete an existing snapshot', async () => {
    await snapshot.delete();
    expect(project.snapshots.length).toBe(0);
  });

});