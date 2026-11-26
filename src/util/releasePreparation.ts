import type { ReleaseDiff } from '../schema/releaseSchema.js';
import type { DestinationIssue } from './destinationIssue.js';

/**
 * What `prepare()` answers: everything a Release would change, and what
 * stops it.
 *
 * `destinationIssues` is empty exactly when no Destination of the Project
 * refuses what `draft` holds, which is when `create()` goes through. A
 * Project without a Destination always answers an empty list.
 *
 * @see ../../docs/releases.md
 */
export interface ReleasePreparation extends ReleaseDiff {
  destinationIssues: DestinationIssue[];
}
