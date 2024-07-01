import { z } from 'zod';

/**
 * Path to the git repository
 */
export const gitRepositoryPathSchema = z.string();

/**
 * Signature git uses to identify users
 */
export const gitSignatureSchema = z.object({
  name: z.string(),
  email: z.string(),
});
export type GitSignature = z.infer<typeof gitSignatureSchema>;

export const gitCommitSchema = z.object({
  /**
   * SHA-1 hash of the commit
   */
  hash: z.string(),
  message: z.string(),
  author: gitSignatureSchema,
  timestamp: z.number(),
  tag: z.string().nullable(),
});
export type GitCommit = z.infer<typeof gitCommitSchema>;

/**
 * Icons for usage in commit messages
 *
 * @see https://gitmoji.dev/
 */
enum GitCommitIconNative {
  INIT = ':tada:',
  CREATE = ':heavy_plus_sign:',
  UPDATE = ':wrench:',
  DELETE = ':fire:',
}
export const gitCommitIconSchema = z.nativeEnum(GitCommitIconNative);
export type GitCommitIcon = z.infer<typeof gitCommitIconSchema>;

export const gitInitOptionsSchema = z.object({
  /**
   * Use the specified name for the initial branch in the newly created repository. If not specified, fall back to the default name (currently master, but this is subject to change in the future; the name can be customized via the init.defaultBranch configuration variable).
   */
  initialBranch: z.string(),
});
export type GitInitOptions = z.infer<typeof gitInitOptionsSchema>;

export const gitCloneOptionsSchema = z.object({
  /**
   * Create a shallow clone with a history truncated to the specified number of commits. Implies --single-branch unless --no-single-branch is given to fetch the histories near the tips of all branches. If you want to clone submodules shallowly, also pass --shallow-submodules.
   */
  depth: z.number(),
  /**
   * Clone only the history leading to the tip of a single branch, either specified by the --branch option or the primary branch remote’s HEAD points at. Further fetches into the resulting repository will only update the remote-tracking branch for the branch this option was used for the initial cloning. If the HEAD at the remote did not point at any branch when --single-branch clone was made, no remote-tracking branch is created.
   */
  singleBranch: z.boolean(),
  /**
   * Instead of pointing the newly created HEAD to the branch pointed to by the cloned repository’s HEAD, point to <name> branch instead. In a non-bare repository, this is the branch that will be checked out. --branch can also take tags and detaches the HEAD at that commit in the resulting repository.
   */
  branch: z.string(),
});
export type GitCloneOptions = z.infer<typeof gitCloneOptionsSchema>;

export const gitSwitchOptionsSchema = z.object({
  /**
   * If true, creates a new local branch and then switches to it
   *
   * @see https://git-scm.com/docs/git-switch#Documentation/git-switch.txt---createltnew-branchgt
   */
  isNew: z.boolean(),
});
export type GitSwitchOptions = z.infer<typeof gitSwitchOptionsSchema>;

export const gitLogOptionsSchema = z.object({
  /**
   * Limit the result to given number of commits
   */
  limit: z.number().optional(),
  /**
   * Only list commits that are between given SHAs or tag names
   *
   * Note that the commits of from and to are not included in the result
   */
  between: z.object({
    /**
     * From the oldest commit
     */
    from: z.string(),
    /**
     * To the newest commit
     *
     * Defaults to the current HEAD
     */
    to: z.string().optional(),
  }),
});
export type GitLogOptions = z.infer<typeof gitLogOptionsSchema>;
