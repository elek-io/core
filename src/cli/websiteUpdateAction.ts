import type ElekIoCore from '../index.node.js';
import type { DestinationFile, WebsiteUpdateProps } from '../schema/index.js';
import { isValueIssue } from '../util/destinationCheck.js';
import { CoreError } from '../util/shared.js';
import { getCore } from './util.js';

/**
 * Brings a theme's newer version to a website of a Project and switches to
 * it, or prints what the new version cannot take yet.
 *
 * The version is kept beside the one in use and the switch happens in the
 * Project of Core's data directory, on the branch it is checked out on,
 * which is `draft` for a working copy. A synchronize takes it to the
 * Project's remote. Exits non-zero while anything is left, so a pipeline
 * hears it. Throws on failure, the binary entry presents the error.
 */
export const websiteUpdateAction = async ({
  project,
  name,
  version,
}: WebsiteUpdateProps) => {
  const core = getCore();
  const website = await websiteOf(core, project, name);
  const kept = await core.destinations.keepVersion({
    projectId: project,
    id: website.id,
    ...(version === undefined ? {} : { version }),
  });

  // Ids rather than the website's name, which somebody typed. This goes
  // through Core's logger, so it lands in a log file that can be attached to
  // a bug report. See contributing/logging.md.
  if (kept.outcome === 'in-use') {
    core.logger.info({
      source: 'core',
      message: `Website ${website.id} of Project ${project} already uses version ${kept.version} of Contract ${website.contract.id}`,
    });
    return;
  }
  core.logger.info({
    source: 'core',
    message: `Version ${kept.version} of Contract ${website.contract.id} waits beside version ${website.contract.version}, which website ${website.id} of Project ${project} uses`,
  });

  const switched = await core.destinations.switchVersion({
    projectId: project,
    id: website.id,
  });
  if (switched.outcome === 'switched') {
    core.logger.info({
      source: 'core',
      message: `Website ${website.id} of Project ${project} now uses version ${kept.version}. Synchronize the Project to take it to its remote.`,
    });
    return;
  }

  for (const issue of switched.issues) {
    // The words name a Collection, a field and an Entry of the Project, and
    // a Value the Contract refused is quoted inside them, so they go to the
    // person at the terminal. Core's logger gets the kind of issue and the
    // ids, which is what resolves a line against the Project without putting
    // anybody's words in a log file. See contributing/logging.md.
    console.warn(issue.message);
    core.logger.warn({
      source: 'core',
      message: `Version ${kept.version} of Contract ${website.contract.id} reports "${issue.issue}" for website ${website.id} of Project ${project}`,
      meta: {
        'elek.object.type': 'destination',
        'elek.object.id': website.id,
        ...(issue.contractFieldDefinitionId === undefined
          ? {}
          : { 'elek.field_definition.ids': [issue.contractFieldDefinitionId] }),
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
    switched.issues.filter(isValueIssue).map((issue) => issue.entryId)
  );
  const mapping =
    switched.issues.length - switched.issues.filter(isValueIssue).length;
  throw CoreError.preconditionFailed(
    `Version ${kept.version} waits beside version ${website.contract.version}, which website ${website.id} of Project ${project} keeps using: ${mapping} of what it needs is unmapped, and ${entries.size} Entries do not fit. Each is named above. Map the rest and run this again.`
  );
};

/**
 * The website of a Project by the name it was given or by its id, which is
 * the pair an `elek.config.ts` names a Destination by too.
 *
 * Throws `NotFound` listing the names the Project holds, because a name
 * matching none would otherwise read as a Project without a website.
 */
async function websiteOf(
  core: ElekIoCore,
  projectId: string,
  named: string
): Promise<DestinationFile> {
  const { list } = await core.destinations.list({ projectId, limit: 0 });
  const website = list.find((candidate) => {
    return candidate.name === named || candidate.id === named;
  });
  if (website === undefined) {
    throw CoreError.notFound(
      `Project ${projectId} has no website "${named}". It has ${
        list.map((candidate) => `"${candidate.name}"`).join(', ') || 'none'
      }. Name a website by its own name or its id.`
    );
  }
  return website;
}
