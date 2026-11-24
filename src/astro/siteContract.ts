import type { CollectionFile } from '../schema/collectionSchema.js';
import { contractSchema, type Contract } from '../schema/contractSchema.js';
import type { DestinationFile } from '../schema/destinationSchema.js';
import { CoreError } from '../util/shared.js';
import { readDeclaration, type ElekConfig } from './elekConfig.js';
import type { getCore } from './core.js';

/** What a site reads one Project's Entries through */
export interface SiteContract {
  /** The Destination of the Project the site is */
  destination: DestinationFile;
  /** The Contract the site's own code is written against */
  contract: Contract;
  /** The version of that Contract the Destination uses */
  versionInUse: string;
}

/**
 * The Destination and the Contract a Project's declaration reads its Entries
 * through, or undefined for a declaration that names no Destination and so
 * reads the Project's own Collections.
 *
 * Reads the Contract's name from the Project's own copy and never from the
 * theme's address, so a build needs no access to the theme. Throws `NotFound`
 * for a Destination the Project does not hold and `BadRequest` where the
 * site's Contract is another theme's than the Destination follows.
 *
 * @see ../../docs/usage.md
 */
export async function readSiteContract(props: {
  core: ReturnType<typeof getCore>;
  config: ElekConfig;
  alias: string;
}): Promise<SiteContract | undefined> {
  const declaration = readDeclaration(props.config, props.alias);
  if (declaration.destination === undefined) {
    return undefined;
  }
  const projectId = declaration.id;
  const named = declaration.destination;
  const { list } = await props.core.destinations.list({ projectId, limit: 0 });
  const destination = list.find((candidate) => {
    return candidate.name === named || candidate.id === named;
  });
  if (destination === undefined) {
    throw CoreError.notFound(
      `Project "${props.alias}" has no Destination "${named}". It has ${
        list.map((candidate) => `"${candidate.name}"`).join(', ') || 'none'
      }. Name a Destination by its own name or its id.`
    );
  }

  const contract = contractSchema.parse(props.config.contract);
  const kept = await props.core.contracts.read({
    projectId,
    id: destination.contract.id,
  });
  if (kept.name !== contract.name) {
    throw CoreError.badRequest(
      `This site's Contract is "${contract.name}" while Destination "${destination.name}" of Project "${props.alias}" follows "${kept.name}". Point the Destination at this theme, or declare the Project whose website this site is.`
    );
  }

  return {
    destination,
    contract,
    versionInUse: destination.contract.version,
  };
}

/**
 * The Collection of a Contract named by its plural slug or its id, the pair
 * a loader's `collectionIdOrSlug` accepts.
 *
 * Throws `NotFound` listing the Contract's own Collections, because a name
 * matching none would otherwise derive a collection that reads nothing.
 */
export function contractCollectionOf(
  contract: Contract,
  idOrSlug: string
): CollectionFile {
  const collection = contract.collections.find((candidate) => {
    return candidate.slug.plural === idOrSlug || candidate.id === idOrSlug;
  });
  if (collection === undefined) {
    throw CoreError.notFound(
      `The Contract "${contract.name}" has no Collection "${idOrSlug}". It has ${
        contract.collections
          .map((candidate) => `"${candidate.slug.plural}"`)
          .join(', ') || 'none'
      }. Name a Collection by its plural slug or its id.`
    );
  }
  return collection;
}
