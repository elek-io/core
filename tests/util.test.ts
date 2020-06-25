import Path from 'path';
import Elek from '../src/index';
import { Signature } from 'nodegit';

const signature = Signature.now('John Doe', 'john.doe@domain.com');

let firstProjectId: string;

beforeAll(async () => {
  const project = await new Elek.project().create('My first project', signature);
  firstProjectId = project.id;
});

describe('util module', () => {

  it('should throw an error if writing an invalid config file', async () => {
    const invalidConfig = {
      foo: 'bar'
    };
    
    // Here we need to disable both TS and ES linters
    // because TS-linter already shows us the error and ES-lint
    // warns us about us telling the TS-linter to shutup.
    // So this test is basically a thrid tripwire before writing
    // invalid config files.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    await expect(Elek.util.config.write.project(firstProjectId, invalidConfig)).rejects.toThrowError();
  });

  it('should throw an error if reading an invalid config file', async () => {
    const project = await new Elek.project().load(firstProjectId);
    const invalidConfig = {
      foo: 'bar'
    };
    // Using the JSON helper directly to avoid the check in config.write
    // like in the test before
    await Elek.util.json.write(Path.join(project.path, Elek.util.configNameOf.project), invalidConfig);
    // Load the project again to trigger loading the config file
    await expect(new Elek.project().load(firstProjectId)).rejects.toThrowError();
  });

});