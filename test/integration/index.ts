import Chai from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import Fs from 'fs-extra';
import Path from 'path';
import { GitSignature } from '../../old/src/util/git';
import ElekIoCore from '../../src';
import Util from '../../src/util';

Chai.use(ChaiAsPromised);
const expect = Chai.expect;
const core = new ElekIoCore();
const signature: GitSignature = {
  name: 'John Doe',
  email: 'john.doe@test.com'
};

describe('Class ElekIoCore', () => {

  let projectId: string;

  it('should be able to initialize', async () => {
    await Fs.remove(Util.workingDirectory);
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(false);

    await core.init();
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(true);
  });

  it('should be able to create a new project', async () => {
    const project = await core.project.create('Project 1', 'The first project', signature);
    projectId = project.id;

    expect(project).to.have.property('name', 'Project 1');
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(true);
  });

  it('should be able to read an existing project', async () => {
    const project = await core.project.read(projectId);

    expect(project).to.have.property('name', 'Project 1');
  });

  it('should be able to update an existing project', async () => {
    const project = await core.project.read(projectId);
    project.name = 'Project';
    await core.project.update(project);

    expect(await core.project.read(projectId)).to.have.property('name', 'Project');
  });

  it('should be able to add an asset to an existing project', async () => {
    const project = await core.project.read(projectId);
    const filePath = Path.resolve('./test/asset/300x300.png');
    const asset = await core.asset.create(filePath, project, 'en-GB', 'Asset 1', 'My first asset');

    expect(asset).to.have.property('name', 'Asset 1');
    expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language))).to.equal(true);
    expect(await Fs.pathExists(Path.join(Util.workingDirectory, asset.path))).to.equal(true);
  });

  // it('should be able to subscribe to events', async () => {
  //   core.events.subscribe((event) => {
  //     console.log(event);
  //     expect(event).to.have.property('id', 'project:create');
  //   });
  //   await core.project.create('Project', 'The first project');
  // });

  it('should be able to load all projects from disk', async () => {
    const projects = await core.projects();

    expect(projects.length).to.equal(1);
  });

  // it('should be able to delete an existing project', async () => {
  //   const project = await core.project.read(projectId);
  //   await core.project.delete(project);

  //   expect(core.project.read(projectId)).to.be.rejectedWith();
  //   expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(false);
  // });
});