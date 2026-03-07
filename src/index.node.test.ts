import { describe, expect, it } from 'vitest';
import ElekIoCore from './index.node.js';
import core from './test/setup.js';
import Path from 'node:path';

describe('Node.js', function () {
  it('should be able to create a new ElekIoCore instance', function () {
    const defaultCore = new ElekIoCore();
    const coreWithLogLevel = new ElekIoCore({
      log: {
        level: 'debug',
      },
    });
    const coreWithoutCache = new ElekIoCore({
      file: {
        cache: false,
      },
    });

    expect(defaultCore).to.be.instanceOf(ElekIoCore);
    expect(defaultCore.options).to.deep.equal({
      log: {
        level: 'info',
      },
      file: {
        cache: true,
      },
    });

    expect(coreWithLogLevel).to.be.instanceOf(ElekIoCore);
    expect(coreWithLogLevel.options).to.deep.equal({
      log: {
        level: 'debug',
      },
      file: {
        cache: true,
      },
    });

    expect(coreWithoutCache).to.be.instanceOf(ElekIoCore);
    expect(coreWithoutCache.options).to.deep.equal({
      log: {
        level: 'info',
      },
      file: {
        cache: false,
      },
    });
  });

  it('should be able to create a complete Project with Assets, Collections and Entries', async function () {
    /**
     * @todo:
     * - Should the description be optional? -> Yes
     * - Should the description be an object with language keys? -> Yes
     */
    const project = await core.projects.create({
      name: 'elek.io Website',
      description: 'The official elek.io website',
      settings: {
        language: {
          supported: ['en', 'de'],
          default: 'en',
        },
      },
    });

    const asset = await core.assets.create({
      projectId: project.id,
      filePath: Path.resolve('src/test/data/150x150.png'),
      name: 'elek.io',
      description: 'A 150x150 image of the text "elek.io"',
    });

    const featuresCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: {
          en: 'Feature',
          de: 'Funktion',
        },
        plural: {
          en: 'Features',
          de: 'Funktionen',
        },
      },
      description: {
        en: 'Details about the features of our products.',
        de: 'Details zu den Funktionen unserer Produkte.',
      },
      slug: {
        singular: 'feature',
        plural: 'features',
      },
      fieldDefinitions: [
        {
          id: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          valueType: 'reference',
          fieldType: 'asset',
          label: {
            en: 'Image',
            de: 'Bild',
          },
          description: {
            en: 'An optional image of this feature.',
            de: 'Ein optionales Bild von dieser Funktion.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 1,
        },
        {
          id: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Keyword',
            de: 'Schlagwort',
          },
          description: {
            en: 'Short keyword to identify this feature e.g. "Fast", "Secure", "Easy to use" etc.',
            de: 'Kurzes Schlagwort zur Identifizierung dieser Funktion, z.B. "Schnell", "Sicher", "Einfach zu bedienen" usw.',
          },
          inputWidth: '12',
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 30,
          defaultValue: null,
        },
        {
          id: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Name',
            de: 'Name',
          },
          description: {
            en: 'Name of this feature.',
            de: 'Name dieser Funktion.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 60,
          defaultValue: null,
        },
        {
          id: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          valueType: 'string',
          fieldType: 'textarea',
          label: {
            en: 'Description',
            de: 'Beschreibung',
          },
          description: {
            en: 'Describe the feature.',
            de: 'Beschreibe die Funktion.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          defaultValue: null,
          min: 100,
          max: 250,
        },
        {
          id: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          valueType: 'reference',
          fieldType: 'entry',
          ofCollections: [],
          label: {
            en: 'Read more link',
            de: 'Weiterlesen-Link',
          },
          description: {
            en: 'A link to read more about this feature.',
            de: 'Ein Link, um mehr über diese Funktion zu erfahren.',
          },
          inputWidth: '12',
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 1,
        },
      ],
    });

    const featureEntryProjects = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Projects',
            de: 'Projekte',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Organise Content in Projects',
            de: 'Organisiere Inhalte in Projekten',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Create Projects to organise your content. Each Project contains its own Collections, Assets, and settings.',
            de: 'Erstelle Projekte, um deine Inhalte zu organisieren. Jedes Projekt enthält eigene Sammlungen, Assets und Einstellungen.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryAssets = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Assets',
            de: 'Assets',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Add Images, Documents & More as Assets',
            de: 'Füge Bilder, Dokumente und mehr als Assets hinzu',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Add various types of assets such as images, documents, and more to your Projects. Manage all your media and files in one place.',
            de: 'Füge verschiedene Arten von Assets wie Bilder, Dokumente und mehr zu deinen Projekten hinzu. Verwalte alle deine Medien und Dateien an einem Ort.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryCollections = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Collections',
            de: 'Sammlungen',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Create Collections of Content',
            de: 'Erstelle Sammlungen von Inhalten',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Create Collections to organise content that has the same structure. Use field definitions to define the structure, helpful hints and validation rules for your content.',
            de: 'Erstelle Sammlungen, um Inhalte mit derselben Struktur zu organisieren. Verwende Felddefinitionen, um die Struktur, hilfreiche Hinweise und Validierungsregeln für deine Inhalte festzulegen.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryEntries = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Entries',
            de: 'Einträge',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Managing Entries',
            de: 'Verwalten von Einträgen',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Add Entries to your Collections to populate them with content. Each Entry represents a piece of content that can be created, updated and deleted.',
            de: 'Füge Einträge zu deinen Sammlungen hinzu, um sie mit Inhalten zu füllen. Jeder Eintrag stellt ein Stück Inhalt dar, das erstellt, aktualisiert und gelöscht werden kann.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryHistory = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'History',
            de: 'Versionshistorie',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Go Back in Time to Previous Versions',
            de: 'Reise zurück in der Zeit zu vorherigen Versionen',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Keep track of all changes made to your content with version history. Easily revert to previous versions whenever needed.',
            de: 'Behalte alle Änderungen an deinen Inhalten mit der Versionshistorie im Blick. Stelle bei Bedarf problemlos frühere Versionen wieder her.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryTeamwork = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Teamwork',
            de: 'Teamarbeit',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Collaborate with your team seamlessly',
            de: 'Nahtlose Zusammenarbeit mit deinem Team',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Work together by syncing content changes using any Git provider like GitHub, GitLab, Bitbucket and more. Get things done even when offline and synchronize changes when you’re back online.',
            de: 'Arbeite zusammen, indem du Inhaltsänderungen mit jedem Git-Anbieter wie GitHub, GitLab, Bitbucket und mehr synchronisierst. Erledige Aufgaben auch offline und synchronisiere Änderungen, wenn du wieder online bist.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryIntegrate = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Integrate',
            de: 'Integrieren',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Use your Content wherever you want',
            de: 'Verwende deine Inhalte, wo immer du möchtest',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Use elek.io Desktop or Core with any framework of your choice. Integrate it into the build process of your website, app and deploy your content anywhere.',
            de: 'Verwende elek.io Desktop oder Core mit einem Framework deiner Wahl. Integriere es in den Build-Prozess deiner Website, App und deploye deine Inhalte überall.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryInstant = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Instant',
            de: 'Sofort',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Instant content updates without redeployment',
            de: 'Sofortige Inhaltsaktualisierungen ohne Redeployment',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Synchronize content updates to elek.io Cloud and have them instantly available worldwide without the need for redeployment of your website or app.',
            de: 'Synchronisiere Inhaltsaktualisierungen mit elek.io Cloud und habe sie sofort weltweit verfügbar, ohne dass deine Website oder App erneut deployed werden muss.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryReplication = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Replication',
            de: 'Replikation',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Data replication in up to 14 geo-regions',
            de: 'Datenreplikation in bis zu 14 Geo-Regionen',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'We ensure low-latency access to your content by replicating data across multiple geo-regions. elek.io Cloud automatically routes requests to the nearest region for optimal performance.',
            de: 'Wir sorgen für einen latenzarmen Zugriff auf deine Inhalte, indem wir Daten über mehrere Geo-Regionen replizieren. elek.io Cloud leitet Anfragen automatisch an die nächstgelegene Region für optimale Leistung weiter.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryAutomation = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Automation',
            de: 'Automatisierung',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Automate workflows with webhooks and integrations',
            de: 'Automatisiere Workflows mit Webhooks und Integrationen',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Set up webhooks to trigger automated workflows whenever your content changes. Integrate with third-party services or your own backend to keep everything in sync.',
            de: 'Richte Webhooks ein, um automatisierte Workflows auszulösen, sobald sich deine Inhalte ändern. Integriere Drittanbieterdienste oder dein eigenes Backend, um alles synchron zu halten.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryCode = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Code',
            de: 'Code',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Manage your content with code',
            de: 'Verwalte deine Inhalte mit Code',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Manage content programmatically by using elek.io Core directly within your JavaScript / TypeScript codebase. Create Projects, add Collections and Entries and more.',
            de: 'Verwalte Inhalte programmatisch, indem du elek.io Core direkt in deinem JavaScript- / TypeScript-Code verwendest. Erstelle Projekte, füge Sammlungen und Einträge hinzu und mehr.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryApiClients = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'API Clients',
            de: 'API Clients',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Generate API Clients',
            de: 'Generiere API-Clients',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Create typesafe API Clients for your Projects in JavaScript or TypeScript to dynamically read your content locally and remotely via Cloud.',
            de: 'Erstelle typsichere API-Clients für deine Projekte in JavaScript oder TypeScript, um deine Inhalte lokal und remote über die Cloud dynamisch zu lesen.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    const featureEntryExport = await core.entries.create({
      projectId: project.id,
      collectionId: featuresCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '737651a5-ad70-4bbf-b6ad-cb9b8af88bc5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '52daf10c-9ea8-4b84-98f9-d84b4ba4c134',
          content: {
            en: 'Export',
            de: 'Exportieren',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '10f10290-9043-4bab-bf6f-014ee81d41a4',
          content: {
            en: 'Export your content into JSON files',
            de: 'Exportiere deine Inhalte in JSON-Dateien',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '405e2cb0-23c0-4bce-89cd-334acd95dbd0',
          content: {
            en: 'Export your content into JSON files to use them statically or easily integrate with other tools and workflows. Watch mode allows for automatic exports whenever content changes.',
            de: 'Exportiere deine Inhalte in JSON-Dateien, um sie statisch zu verwenden oder einfach mit anderen Tools und Workflows zu integrieren. Der Watch-Modus ermöglicht automatische Exporte, sobald sich Inhalte ändern.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '7cfbd197-f949-4f5a-b71c-5f5c77653df8',
          content: {
            en: [],
            de: [],
          },
        },
      ],
    });

    /**
     * @todo:
     * - Should allow for sections of field definitions to visually group them.
     */
    const productsCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: {
          en: 'Product',
          de: 'Produkt',
        },
        plural: {
          en: 'Products',
          de: 'Produkte',
        },
      },
      description: {
        en: 'Details about the products we offer.',
        de: 'Details zu den Produkten, die wir anbieten.',
      },
      slug: {
        singular: 'product',
        plural: 'products',
      },
      fieldDefinitions: [
        {
          id: '559cda05-91a5-40d2-8113-fb0267e320f4',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Name',
            de: 'Name',
          },
          description: {
            en: 'Name of this product.',
            de: 'Name dieses Produkts.',
          },
          inputWidth: '6',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          id: 'bec97b46-710e-4d9c-bc73-51af731e727f',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Slug',
            de: 'Slug',
          },
          description: {
            en: 'The slug is unique and unsed for the URL of this product.',
            de: 'Der Slug ist einzigartig und wird für die URL dieses Produkts verwendet.',
          },
          inputWidth: '6',
          isRequired: true,
          isDisabled: false,
          isUnique: true,
          defaultValue: null,
          min: null,
          max: null,
        },
        {
          id: '8b8bca59-8cc7-4357-8984-b5a2caf21020',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Tagline',
            de: 'Tagline',
          },
          description: {
            en: 'A short, catchy sentence that conveys the main message of this product.',
            de: 'Kurzer, prägnanter Satz, der die Hauptaussage dieses Produkts vermittelt.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 50,
          defaultValue: null,
        },
        {
          id: 'b025e42e-ff64-40dd-8fbf-d41f7c9ae5fa',
          valueType: 'string',
          fieldType: 'textarea',
          label: {
            en: 'Short description',
            de: 'Kurzbeschreibung',
          },
          description: {
            en: 'Used for the meta description (SEO) and as a short summary of the product.',
            de: 'Wird für die Meta-Beschreibung (SEO) und als kurze Zusammenfassung des Produkts verwendet.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          defaultValue: null,
          min: 80,
          max: 165,
        },
        {
          id: '8bc0a027-5448-4a9c-8b04-4c6141bc29f5',
          valueType: 'reference',
          fieldType: 'asset',
          label: {
            en: 'Image',
            de: 'Bild',
          },
          description: {
            en: 'An optional image of this product.',
            de: 'Ein optionales Bild von diesem Produkt.',
          },
          inputWidth: '12',
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 1,
        },
        {
          id: '83830be8-c372-44bf-a1b4-83d83e0babe9',
          valueType: 'string',
          fieldType: 'textarea',
          label: {
            en: 'Feature description',
            de: 'Feature-Beschreibung',
          },
          description: {
            en: 'A brief description of the features.',
            de: 'Eine kurze Beschreibung der Funktionen.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          id: 'd106e37c-e6e3-4039-92f5-365163ecdd3c',
          valueType: 'reference',
          fieldType: 'entry',
          ofCollections: [featuresCollection.id],
          label: {
            en: 'Features',
            de: 'Funktionen',
          },
          description: {
            en: 'A list of features of this product.',
            de: 'Eine Liste der Funktionen dieses Produkts.',
          },
          inputWidth: '12',
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
        },
      ],
    });

    const productEntryDesktop = await core.entries.create({
      projectId: project.id,
      collectionId: productsCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '559cda05-91a5-40d2-8113-fb0267e320f4',
          content: {
            en: 'elek.io Desktop',
            de: 'elek.io Desktop',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'bec97b46-710e-4d9c-bc73-51af731e727f',
          content: {
            en: 'desktop',
            de: 'desktop',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '8b8bca59-8cc7-4357-8984-b5a2caf21020',
          content: {
            en: 'The offline-first CMS',
            de: 'Das Offline-First-CMS',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'b025e42e-ff64-40dd-8fbf-d41f7c9ae5fa',
          content: {
            en: "Manage your content locally, even when you're offline - no server needed. Sync changes when you're back online.",
            de: 'Verwalte deine Inhalte lokal, auch wenn du offline bist - kein Server erforderlich. Synchronisiere Änderungen, wenn du wieder online bist.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '8bc0a027-5448-4a9c-8b04-4c6141bc29f5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '83830be8-c372-44bf-a1b4-83d83e0babe9',
          content: {
            en: 'Too long',
            de: 'Zu lang',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: 'd106e37c-e6e3-4039-92f5-365163ecdd3c',
          content: {
            en: [
              {
                objectType: 'entry',
                id: featureEntryProjects.id,
              },
              {
                objectType: 'entry',
                id: featureEntryAssets.id,
              },
              {
                objectType: 'entry',
                id: featureEntryCollections.id,
              },
              {
                objectType: 'entry',
                id: featureEntryEntries.id,
              },
              {
                objectType: 'entry',
                id: featureEntryHistory.id,
              },
              {
                objectType: 'entry',
                id: featureEntryTeamwork.id,
              },
              {
                objectType: 'entry',
                id: featureEntryIntegrate.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: featureEntryProjects.id,
              },
              {
                objectType: 'entry',
                id: featureEntryAssets.id,
              },
              {
                objectType: 'entry',
                id: featureEntryCollections.id,
              },
              {
                objectType: 'entry',
                id: featureEntryEntries.id,
              },
              {
                objectType: 'entry',
                id: featureEntryHistory.id,
              },
              {
                objectType: 'entry',
                id: featureEntryTeamwork.id,
              },
              {
                objectType: 'entry',
                id: featureEntryIntegrate.id,
              },
            ],
          },
        },
      ],
    });

    const productEntryCloud = await core.entries.create({
      projectId: project.id,
      collectionId: productsCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '559cda05-91a5-40d2-8113-fb0267e320f4',
          content: {
            en: 'elek.io Cloud',
            de: 'elek.io Cloud',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'bec97b46-710e-4d9c-bc73-51af731e727f',
          content: {
            en: 'cloud',
            de: 'cloud',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '8b8bca59-8cc7-4357-8984-b5a2caf21020',
          content: {
            en: 'The Content Delivery API',
            de: 'Die Content Delivery API',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'b025e42e-ff64-40dd-8fbf-d41f7c9ae5fa',
          content: {
            en: 'Host your content globally available with minimum latency. Connect APIs and webhooks easily with elek.io Cloud.',
            de: 'Mache deine Inhalte weltweit mit minimaler Latenz verfügbar. Verbinde APIs und Webhooks einfach mit elek.io Cloud.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '8bc0a027-5448-4a9c-8b04-4c6141bc29f5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '83830be8-c372-44bf-a1b4-83d83e0babe9',
          content: {
            en: 'elek.io Cloud is a globally distributed content delivery API that ensures your content is always available with minimal latency, no matter where your users are located.',
            de: 'elek.io Cloud ist eine global verteilte Content Delivery API, die sicherstellt, dass deine Inhalte immer mit minimaler Latenz verfügbar sind, egal wo sich deine Nutzer befinden.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: 'd106e37c-e6e3-4039-92f5-365163ecdd3c',
          content: {
            en: [
              {
                objectType: 'entry',
                id: featureEntryInstant.id,
              },
              {
                objectType: 'entry',
                id: featureEntryReplication.id,
              },
              {
                objectType: 'entry',
                id: featureEntryAutomation.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: featureEntryInstant.id,
              },
              {
                objectType: 'entry',
                id: featureEntryReplication.id,
              },
              {
                objectType: 'entry',
                id: featureEntryAutomation.id,
              },
            ],
          },
        },
      ],
    });

    const productEntryCore = await core.entries.create({
      projectId: project.id,
      collectionId: productsCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '559cda05-91a5-40d2-8113-fb0267e320f4',
          content: {
            en: 'elek.io Core',
            de: 'elek.io Core',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'bec97b46-710e-4d9c-bc73-51af731e727f',
          content: {
            en: 'core',
            de: 'core',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '8b8bca59-8cc7-4357-8984-b5a2caf21020',
          content: {
            en: 'Generate API Clients and export content',
            de: 'Generiere API-Clients und exportiere Inhalte',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'b025e42e-ff64-40dd-8fbf-d41f7c9ae5fa',
          content: {
            en: 'Programmatically manage your content, generate JavaScript / TypeScript API Clients and use our CLI tool to export content.',
            de: 'Verwalte deine Inhalte programmgesteuert, generiere JavaScript / TypeScript API-Clients und verwende unser CLI-Tool, um Inhalte zu exportieren.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '8bc0a027-5448-4a9c-8b04-4c6141bc29f5',
          content: {
            en: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
            de: [
              {
                objectType: 'asset',
                id: asset.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '83830be8-c372-44bf-a1b4-83d83e0babe9',
          content: {
            en: 'elek.io Core additionally to using the build in API of elek.io Desktop, gives you multiple other ways to interact with your content.',
            de: 'elek.io Core zusätzlich zur Verwendung der integrierten API von elek.io Desktop bietet dir mehrere andere Möglichkeiten, mit deinen Inhalten zu interagieren.',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: 'd106e37c-e6e3-4039-92f5-365163ecdd3c',
          content: {
            en: [
              {
                objectType: 'entry',
                id: featureEntryCode.id,
              },
              {
                objectType: 'entry',
                id: featureEntryApiClients.id,
              },
              {
                objectType: 'entry',
                id: featureEntryExport.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: featureEntryCode.id,
              },
              {
                objectType: 'entry',
                id: featureEntryApiClients.id,
              },
              {
                objectType: 'entry',
                id: featureEntryExport.id,
              },
            ],
          },
        },
      ],
    });

    /**
     * @todo:
     * - Conditional fields based on other field values e.g. if "External Link" is true, the "Target page" field is not visible and the "URL" field is shown.
     */
    const navigationItemCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: {
          en: 'Navigation Item',
          de: 'Navigationselement',
        },
        plural: {
          en: 'Navigation Items',
          de: 'Navigationselemente',
        },
      },
      description: {
        en: 'Navigation Items reference other Entries that are part of a Navigation.',
        de: 'Navigationselemente verweisen auf andere Einträge, die Teil einer Navigation sind.',
      },
      slug: {
        singular: 'navigation-item',
        plural: 'navigation-items',
      },
      fieldDefinitions: [
        {
          id: 'd1686a8e-5761-42e0-9801-47d3bcd9e682',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Name',
            de: 'Name',
          },
          description: {
            en: 'Name of this navigation item e.g. "Home", "About", "Contact" etc.',
            de: 'Name dieses Navigationselements, z.B. "Startseite", "Über uns", "Kontakt" etc.',
          },
          inputWidth: '6',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          id: '8336f242-2136-47a6-9e40-05d08283c026',
          valueType: 'boolean',
          fieldType: 'toggle',
          label: {
            en: 'External Link',
            de: 'Externer Link',
          },
          description: {
            en: 'If this is an external link, the "Target page" field will be ignored and the "URL" field will be used instead.',
            de: 'Wenn dies ein externer Link ist, wird das Feld "Zielseite" ignoriert und stattdessen das "URL"-Feld verwendet.',
          },
          inputWidth: '6',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          defaultValue: false,
        },
        {
          id: '378b11d0-4e05-4612-99ba-7660a29fa417',
          valueType: 'reference',
          fieldType: 'entry',
          ofCollections: [productsCollection.id],
          label: {
            en: 'Target page',
            de: 'Zielseite',
          },
          description: {
            en: 'The target page of this navigation item. This field is ignored if "External Link" is set to true.',
            de: 'Die Zielseite dieses Navigationselements. Dieses Feld wird ignoriert, wenn "Externer Link" auf true gesetzt ist.',
          },
          inputWidth: '12',
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 1,
        },
        {
          id: 'd58284e5-8a75-4bea-9f54-51eda6600794',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'URL',
            de: 'URL',
          },
          description: {
            en: 'The URL of this navigation item. This field is only used if "External Link" is set to true.',
            de: 'Die URL dieses Navigationselements. Dieses Feld wird nur verwendet, wenn "Externer Link" auf true gesetzt ist.',
          },
          inputWidth: '12',
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });

    const navigationItemEntryDesktop = await core.entries.create({
      projectId: project.id,
      collectionId: navigationItemCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'd1686a8e-5761-42e0-9801-47d3bcd9e682',
          content: {
            en: 'elek.io Desktop',
            de: 'elek.io Desktop',
          },
        },
        {
          objectType: 'value',
          valueType: 'boolean',
          fieldDefinitionId: '8336f242-2136-47a6-9e40-05d08283c026',
          content: {
            en: false,
            de: false,
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '378b11d0-4e05-4612-99ba-7660a29fa417',
          content: {
            en: [
              {
                objectType: 'entry',
                id: productEntryDesktop.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: productEntryDesktop.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'd58284e5-8a75-4bea-9f54-51eda6600794',
          content: {},
        },
      ],
    });

    const navigationItemEntryCloud = await core.entries.create({
      projectId: project.id,
      collectionId: navigationItemCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'd1686a8e-5761-42e0-9801-47d3bcd9e682',
          content: {
            en: 'elek.io Cloud',
            de: 'elek.io Cloud',
          },
        },
        {
          objectType: 'value',
          valueType: 'boolean',
          fieldDefinitionId: '8336f242-2136-47a6-9e40-05d08283c026',
          content: {
            en: false,
            de: false,
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '378b11d0-4e05-4612-99ba-7660a29fa417',
          content: {
            en: [
              {
                objectType: 'entry',
                id: productEntryCloud.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: productEntryCloud.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'd58284e5-8a75-4bea-9f54-51eda6600794',
          content: {},
        },
      ],
    });

    const navigationItemEntryCore = await core.entries.create({
      projectId: project.id,
      collectionId: navigationItemCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'd1686a8e-5761-42e0-9801-47d3bcd9e682',
          content: {
            en: 'elek.io Core',
            de: 'elek.io Core',
          },
        },
        {
          objectType: 'value',
          valueType: 'boolean',
          fieldDefinitionId: '8336f242-2136-47a6-9e40-05d08283c026',
          content: {
            en: false,
            de: false,
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '378b11d0-4e05-4612-99ba-7660a29fa417',
          content: {
            en: [
              {
                objectType: 'entry',
                id: productEntryCore.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: productEntryCore.id,
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'd58284e5-8a75-4bea-9f54-51eda6600794',
          content: {},
        },
      ],
    });

    /**
     * @todo:
     * - Should the user define field definition IDs or should they be generated?
     * - Should the description be optional? -> Yes
     * - Field definitions need a valueType of "reference" with the fieldType of "slug" and ofField referencing a field definition ID of the same collection to be able to generate slugs based on another field.
     */
    const navigationCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: {
          en: 'Navigation',
          de: 'Navigation',
        },
        plural: {
          en: 'Navigations',
          de: 'Navigationen',
        },
      },
      description: {
        en: 'All navigations',
        de: 'Alle Navigationen',
      },
      slug: {
        singular: 'navigation',
        plural: 'navigations',
      },
      fieldDefinitions: [
        {
          id: '8f3fa878-d137-42da-b353-714d3d01b83a',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Name',
            de: 'Name',
          },
          description: {
            en: 'Name of this navigation e.g. "Header Navigation", "Footer Navigation" etc.',
            de: 'Name dieser Navigation, z.B. "Haupt-Navigation", "Fußzeilen-Navigation" etc.',
          },
          inputWidth: '6',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          id: '64948570-104f-441b-9e25-f006e1eae9d1',
          valueType: 'string',
          fieldType: 'text',
          label: {
            en: 'Slug',
            de: 'Slug',
          },
          description: {
            en: 'The slug is unique and unsed to identfiy this navigation.',
            de: 'Der Slug ist einzigartig und wird verwendet, um diese Navigation zu identifizieren.',
          },
          inputWidth: '6',
          isRequired: true,
          isDisabled: false,
          isUnique: true,
          defaultValue: null,
          min: null,
          max: null,
        },
        {
          id: '9d0f1c02-5855-4a5e-8190-58000d2bdee6',
          valueType: 'reference',
          fieldType: 'entry',
          ofCollections: [navigationItemCollection.id],
          label: {
            en: 'Navigation Items',
            de: 'Navigationselemente',
          },
          description: {
            en: 'The navigation items of this navigation.',
            de: 'Die Navigationselemente dieser Navigation.',
          },
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: null,
        },
      ],
    });

    await core.entries.create({
      projectId: project.id,
      collectionId: navigationCollection.id,
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '8f3fa878-d137-42da-b353-714d3d01b83a',
          content: {
            en: 'Product Navigation',
            de: 'Produkt-Navigation',
          },
        },
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: '64948570-104f-441b-9e25-f006e1eae9d1',
          content: {
            en: 'products',
            de: 'produkte',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '9d0f1c02-5855-4a5e-8190-58000d2bdee6',
          content: {
            en: [
              {
                objectType: 'entry',
                id: navigationItemEntryDesktop.id,
              },
              {
                objectType: 'entry',
                id: navigationItemEntryCloud.id,
              },
              {
                objectType: 'entry',
                id: navigationItemEntryCore.id,
              },
            ],
            de: [
              {
                objectType: 'entry',
                id: navigationItemEntryDesktop.id,
              },
              {
                objectType: 'entry',
                id: navigationItemEntryCloud.id,
              },
              {
                objectType: 'entry',
                id: navigationItemEntryCore.id,
              },
            ],
          },
        },
      ],
    });

    await core.projects.delete({ id: project.id, force: true });
  });
});
