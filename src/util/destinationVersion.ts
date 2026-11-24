import type { DestinationFile } from '../schema/destinationSchema.js';
import type { DestinationIssue } from './destinationIssue.js';

/**
 * What keeping a version of a theme's Contract left the website with.
 *
 * `waiting` means that version now waits beside the one in use, with a
 * Mapping of its own, and `in-use` that the website already uses it, which
 * is what asking for the newest tagged version of a current website gives.
 */
export interface KeptVersion {
  outcome: 'waiting' | 'in-use';
  /** The version the call was about */
  version: string;
  /** The website as it stands now */
  destination: DestinationFile;
}

/**
 * What switching a website to the version that waits did.
 *
 * `switched` means the website now uses it, and `kept` that it kept the
 * version it uses, because `issues` names what the waiting version still
 * lacks. `issues` is empty exactly when the outcome is `switched`.
 */
export interface SwitchedVersion {
  outcome: 'switched' | 'kept';
  issues: DestinationIssue[];
  /** The website as it stands now */
  destination: DestinationFile;
}
