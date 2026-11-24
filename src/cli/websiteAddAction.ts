import type { WebsiteAddProps } from '../schema/index.js';
import { isValueIssue } from '../util/destinationCheck.js';
import { CoreError } from '../util/shared.js';
import { getCore } from './util.js';

/**
 * Adds a website to a Project from its theme's git address and prints what
 * the website cannot take yet.
 *
 * The website is written and committed in the Project of Core's data
 * directory, on the branch it is checked out on, which is `draft` for a
 * working copy. A synchronize takes it to the Project's remote. Exits
 * non-zero while anything is left, so a pipeline hears it. Throws on
 * failure, the binary entry presents the error.
 */
export const websiteAddAction = async ({
  project,
  name,
  theme,
  version,
}: WebsiteAddProps) => {
  const core = getCore();
  const website = await core.destinations.addWebsite({
    projectId: project,
    name,
    url: theme,
    ...(version === undefined ? {} : { version }),
  });
  const issues = await core.destinations.checkAll({
    projectId: project,
    id: website.id,
  });

  // Ids rather than the website's name, which somebody typed. This goes
  // through Core's logger, so it lands in a log file that can be attached to
  // a bug report. See contributing/logging.md.
  core.logger.info({
    source: 'core',
    message: `Added website ${website.id} to Project ${project}, on Contract ${website.contract.id} at version ${website.contract.version}. Synchronize the Project to take it to its remote.`,
  });

  if (issues.length === 0) {
    core.logger.info({
      source: 'core',
      message: `Website ${website.id} can take every Entry of Project ${project}`,
    });
    return;
  }

  for (const issue of issues) {
    core.logger.warn({
      source: 'core',
      message: issue.message,
      meta: {
        'elek.object.type': 'destination',
        'elek.object.id': website.id,
        ...(isValueIssue(issue)
          ? {
              'elek.collection.id': issue.collectionId,
              'elek.entry.id': issue.entryId,
            }
          : {}),
      },
    });
  }

  const entries = new Set(
    issues.filter(isValueIssue).map((issue) => issue.entryId)
  );
  const mapping = issues.length - issues.filter(isValueIssue).length;
  throw CoreError.preconditionFailed(
    `Website ${website.id} was added to Project ${project} and cannot take it yet: ${mapping} of what its Contract needs is unmapped, and ${entries.size} Entries do not fit. Each is named above. Map the rest and check again.`
  );
};
