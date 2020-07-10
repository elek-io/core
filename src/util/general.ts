import { v4 as Uuid } from 'uuid';
import Slugify from 'slugify';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';

/**
 * Returns true if the "value" object has all keys of "source",
 * otherwise an array of missing keys
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function hasKeysOf(value: any, source: any): true | string[] {
  const missingKeys: string[] = [];
  Object.keys(source).forEach((key) => {
    if (Object.keys(value).includes(key) === false) {
      missingKeys.push(key);
    }
  });
  if (missingKeys.length > 0) {
    return missingKeys;
  }
  return true;
}

/**
 * Returns a new UUID
 * @todo remove once ID is returned from API
 */
export function uuid(): string {
  return Uuid();
}

/**
 * Returns a complete default type, hydrated with the partials of value
 */
export function assignDefaultIfMissing<T>(value: Partial<T>, defaultsTo: T): T {
  return Object.assign(defaultsTo, value);
}

/**
 * Returns the slug of given string
 */
export function slug(string: string): string {
  return Slugify(string, {
    replacement: '-',  // replace spaces with replacement character, defaults to `-`
    remove: undefined, // remove characters that match regex, defaults to `undefined`
    lower: true,       // convert to lower case, defaults to `false`
    strict: true       // strip special characters except replacement, defaults to `false`
  });
}

/**
 * Basically a Promise.all() without rejecting if one promise fails to resolve
 */
export async function returnResolved<T>(promises: Promise<T>[]): Promise<T[]> {
  const toCheck: Promise<T | Error>[] = [];
  for (let index = 0; index < promises.length; index++) {
    const promise = promises[index];
    // Here comes the trick:
    // By using "then" and "catch" we are able to create an array of Project and Error types
    // without throwing and stopping the later Promise.all() call prematurely
    toCheck.push(promise.then((result) => {
      return result;
    }).catch((error) => {
      // Because the error parameter could be anything, 
      // we need to specifically call an Error 
      return new Error(error);
    }));
  }
  // Resolve all promises
  // Here we do not expect any error to fail the call to Promise.all()
  // because we catched it earlier and returning an Error type instead of throwing it
  const checked = await Promise.all(toCheck);
  // This way we can easily filter out any Error types
  // and are able to return only initialized projects 
  // that did not throw an error.
  // Note that we also need to use a User-Defined Type Guard here,
  // because otherwise TS does not recognize we are filtering the errors out
  //                         >       |        < 
  return checked.filter((item): item is T => {
    return item instanceof Error !== true;
  });
}

/**
 * Custom async typescript ready implementation of Node.js child_process
 * 
 * @see https://nodejs.org/api/child_process.html
 * @see https://github.com/ralphtheninja/await-spawn
 */
export function spawnChildProcess(command: string, args: ReadonlyArray<string>, options?: SpawnOptionsWithoutStdio): Promise<string> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, options);
    let log = '';

    childProcess.stdout.on('data', (data) => {
      log += data;
    });

    childProcess.stderr.on('data', (data) => {
      log += data;
    });

    childProcess.on('error', (error) => {
      throw error;
    });

    childProcess.on('exit', (code) => {
      if (code === 0) {
        return resolve(log);
      }
      return reject(log);
    });
  });
}