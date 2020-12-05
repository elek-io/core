import { expect } from 'chai';
import Fs from 'fs-extra';
import ElekIoCore from '../../src';
import Util from '../../src/util';

const core = new ElekIoCore();

describe('Class ElekIoCore', () => {

  it('should be able to initialize', async () => {
    await Fs.remove(Util.workingDirectory);
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(false);

    await core.init();
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(true);
  });

  it('should be able to create a new project', async () => {
    const project = await core.project.create('Project', 'The first project');

    expect(project).to.have.property('name', 'Project');
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(true);
  });
});