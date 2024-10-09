import { z } from 'zod';
import { objectTypeSchema, uuidSchema } from './baseSchema.js';

/**
 * Signature git uses to identify users
 */
export const gitSignatureSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});
export type GitSignature = z.infer<typeof gitSignatureSchema>;

export const gitMessageSchema = z.object({
  method: z.enum(['create', 'update', 'delete', 'upgrade']),
  reference: z.object({
    objectType: objectTypeSchema,
    /**
     * ID of the objectType
     */
    id: uuidSchema,
    /**
     * Only present if the objectType is of "entry"
     */
    collectionId: uuidSchema.optional(),
  }),
});
export type GitMessage = z.infer<typeof gitMessageSchema>;

export const gitTagSchema = z.object({
  id: uuidSchema,
  message: z.string(),
  author: gitSignatureSchema,
  datetime: z.string().datetime(),
});
export type GitTag = z.infer<typeof gitTagSchema>;

export const gitCommitSchema = z.object({
  /**
   * SHA-1 hash of the commit
   */
  hash: z.string(),
  message: gitMessageSchema,
  author: gitSignatureSchema,
  datetime: z.string().datetime(),
  tag: gitTagSchema.nullable(),
});
export type GitCommit = z.infer<typeof gitCommitSchema>;

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
  /**
   * Make a bare Git repository. That is, instead of creating <directory> and placing the administrative files in <directory>`/.git`, make the <directory> itself the $GIT_DIR.
   * Used primarily to copy an existing local repository to a server, where you want to set up the repository as a central point to work with others.
   *
   * The destination path for the cloned repository should end with a .git by convention.
   *
   * @see https://git-scm.com/book/en/v2/Git-on-the-Server-Getting-Git-on-a-Server
   */
  bare: z.boolean(),
});
export type GitCloneOptions = z.infer<typeof gitCloneOptionsSchema>;

export const gitMergeOptionsSchema = z.object({
  squash: z.boolean(),
});
export type GitMergeOptions = z.infer<typeof gitMergeOptionsSchema>;

export const gitSwitchOptionsSchema = z.object({
  /**
   * If true, creates a new local branch and then switches to it
   *
   * @see https://git-scm.com/docs/git-switch#Documentation/git-switch.txt---createltnew-branchgt
   */
  isNew: z.boolean().optional(),
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
  /**
   * Only shows commits of given file
   */
  filePath: z.string().optional(),
});
export type GitLogOptions = z.infer<typeof gitLogOptionsSchema>;

export const createGitTagSchema = gitTagSchema
  .pick({
    message: true,
  })
  .extend({
    path: z.string(),
    hash: z.string().optional(),
  });
export type CreateGitTagProps = z.infer<typeof createGitTagSchema>;

export const readGitTagSchema = z.object({
  path: z.string(),
  id: uuidSchema.readonly(),
});
export type ReadGitTagProps = z.infer<typeof readGitTagSchema>;

export const deleteGitTagSchema = readGitTagSchema.extend({});
export type DeleteGitTagProps = z.infer<typeof deleteGitTagSchema>;

export const countGitTagsSchema = z.object({
  path: z.string(),
});
export type CountGitTagsProps = z.infer<typeof countGitTagsSchema>;
