import { expect } from 'chai';
import Fs from 'fs-extra';
import ElekIoCore from '../../src';
import Util from '../../src/util';

const core = new ElekIoCore();

describe('Class ElekIoCore', () => {

  describe('init', () => {
    it('should create the folder structure', async () => {
      await Fs.remove(Util.workingDirectory);
      expect(await Fs.pathExists(Util.workingDirectory)).to.equal(false);

      await core.init();
      expect(await Fs.pathExists(Util.workingDirectory)).to.equal(true);
    });
  });

  // describe('Asset', () => {
  //   beforeEach(async () => {

  //   });

  //   it('should be able to init when started for the first time', () => {
  //     expect(true).to.equal(true);
  //   });
  // });
});