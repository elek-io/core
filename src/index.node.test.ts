import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
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

  it(
    'should be able to create a complete Project with Assets, Collections and Entries',
    { timeout: 30000 },
    async function () {
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
              id: uuid(),
              slug: 'size',
              valueType: 'number',
              fieldType: 'select',
              label: {
                en: 'Size',
                de: 'Größe',
              },
              description: {
                en: 'Size of the feature.',
                de: 'Größe der Funktion.',
              },
              options: [
                { value: 2, label: { en: '1/6', de: '1/6' } },
                { value: 3, label: { en: '1/4', de: '1/4' } },
                { value: 6, label: { en: '1/2', de: '1/2' } },
                { value: 12, label: { en: 'Full', de: 'Voll' } },
              ],
              inputWidth: '12',
              isRequired: true,
              isDisabled: false,
              isUnique: false,
              min: null,
              max: null,
              defaultValue: null,
            },
            {
              id: uuid(),
              slug: 'image',
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
              isRequired: false,
              isDisabled: false,
              isUnique: false,
              min: null,
              max: 1,
            },
            {
              id: uuid(),
              slug: 'keyword',
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
              id: uuid(),
              slug: 'name',
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
              id: uuid(),
              slug: 'description',
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
              id: uuid(),
              slug: 'read-more-link',
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
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 6,
                de: 6,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Projects',
                de: 'Projekte',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Organise Content in Projects',
                de: 'Organisiere Inhalte in Projekten',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Create Projects to organise your content. Each Project contains its own Collections, Assets, and settings.',
                de: 'Erstelle Projekte, um deine Inhalte zu organisieren. Jedes Projekt enthält eigene Sammlungen, Assets und Einstellungen.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryAssets = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 6,
                de: 6,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Assets',
                de: 'Assets',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Add Images, Documents & More as Assets',
                de: 'Füge Bilder, Dokumente und mehr als Assets hinzu',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Add various types of assets such as images, documents, and more to your Projects. Manage all your media and files in one place.',
                de: 'Füge verschiedene Arten von Assets wie Bilder, Dokumente und mehr zu deinen Projekten hinzu. Verwalte alle deine Medien und Dateien an einem Ort.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryCollections = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Collections',
                de: 'Sammlungen',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Create Collections of Content',
                de: 'Erstelle Sammlungen von Inhalten',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Create Collections to organise content that has the same structure. Use field definitions to define the structure, helpful hints and validation rules for your content.',
                de: 'Erstelle Sammlungen, um Inhalte mit derselben Struktur zu organisieren. Verwende Felddefinitionen, um die Struktur, hilfreiche Hinweise und Validierungsregeln für deine Inhalte festzulegen.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryEntries = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Entries',
                de: 'Einträge',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Managing Entries',
                de: 'Verwalten von Einträgen',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Add Entries to your Collections to populate them with content. Each Entry represents a piece of content that can be created, updated and deleted.',
                de: 'Füge Einträge zu deinen Sammlungen hinzu, um sie mit Inhalten zu füllen. Jeder Eintrag stellt ein Stück Inhalt dar, das erstellt, aktualisiert und gelöscht werden kann.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryHistory = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'History',
                de: 'Versionshistorie',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Go Back in Time to Previous Versions',
                de: 'Reise zurück in der Zeit zu vorherigen Versionen',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Keep track of all changes made to your content with version history. Easily revert to previous versions whenever needed.',
                de: 'Behalte alle Änderungen an deinen Inhalten mit der Versionshistorie im Blick. Stelle bei Bedarf problemlos frühere Versionen wieder her.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryTeamwork = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 6,
                de: 6,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Teamwork',
                de: 'Teamarbeit',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Collaborate with your team seamlessly',
                de: 'Nahtlose Zusammenarbeit mit deinem Team',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: "Work together by syncing content changes using any Git provider like GitHub, GitLab, Bitbucket and more. Get things done even when offline and synchronize changes when you're back online.",
                de: 'Arbeite zusammen, indem du Inhaltsänderungen mit jedem Git-Anbieter wie GitHub, GitLab, Bitbucket und mehr synchronisierst. Erledige Aufgaben auch offline und synchronisiere Änderungen, wenn du wieder online bist.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryIntegrate = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 6,
                de: 6,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Integrate',
                de: 'Integrieren',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Use your Content wherever you want',
                de: 'Verwende deine Inhalte, wo immer du möchtest',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Use elek.io Desktop or Core with any framework of your choice. Integrate it into the build process of your website, app and deploy your content anywhere.',
                de: 'Verwende elek.io Desktop oder Core mit einem Framework deiner Wahl. Integriere es in den Build-Prozess deiner Website, App und deploye deine Inhalte überall.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryOfflineFirst = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Offline-first',
                de: 'Offline-first',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Work on your content even when you are offline',
                de: 'Arbeite an deinen Inhalten, auch wenn du offline bist',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Running on your local device (Windows, macOS, Linux) so you can work completely offline. Sync with others when and if you want.',
                de: 'Läuft auf deinem lokalen Gerät (Windows, macOS, Linux), sodass du vollständig offline arbeiten kannst. Synchronisiere mit anderen, wann und wenn du willst.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryPerformanceAndSecurity = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Fast & Secure',
                de: 'Schnell & Sicher',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Great Performance & Security',
                de: 'Großartige Leistung & Sicherheit',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'No public server means less vulnerabilities. It also means your content is stored locally and therefore accessible almost instantaneously.',
                de: 'Kein öffentlicher Server bedeutet weniger Sicherheitslücken. Es bedeutet auch, dass deine Inhalte lokal gespeichert werden und daher nahezu sofort zugänglich sind.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryFreeAndSourceAvailable = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Free & Source-Available',
                de: 'Kostenlos & Quelloffen',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Use it without charge. Source code is available on GitHub',
                de: 'Kostenlos nutzbar. Der Quellcode ist auf GitHub verfügbar',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Use it without charge. The source code is available on GitHub. Feel free to contribute or suggest features and improvements.',
                de: 'Kostenlos nutzbar. Der Quellcode ist auf GitHub verfügbar. Du kannst gerne beitragen oder Funktionen und Verbesserungen vorschlagen.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryInstant = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Instant',
                de: 'Sofort',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Instant content updates without redeployment',
                de: 'Sofortige Inhaltsaktualisierungen ohne Redeployment',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Synchronize content updates to elek.io Cloud and have them instantly available worldwide without the need for redeployment of your website or app.',
                de: 'Synchronisiere Inhaltsaktualisierungen mit elek.io Cloud und habe sie sofort weltweit verfügbar, ohne dass deine Website oder App erneut deployed werden muss.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryReplication = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Replication',
                de: 'Replikation',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Data replication in up to 14 geo-regions',
                de: 'Datenreplikation in bis zu 14 Geo-Regionen',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'We ensure low-latency access to your content by replicating data across multiple geo-regions. elek.io Cloud automatically routes requests to the nearest region for optimal performance.',
                de: 'Wir sorgen für einen latenzarmen Zugriff auf deine Inhalte, indem wir Daten über mehrere Geo-Regionen replizieren. elek.io Cloud leitet Anfragen automatisch an die nächstgelegene Region für optimale Leistung weiter.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryAutomation = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 3,
                de: 3,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Automation',
                de: 'Automatisierung',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Automate workflows with webhooks and integrations',
                de: 'Automatisiere Workflows mit Webhooks und Integrationen',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Set up webhooks to trigger automated workflows whenever your content changes. Integrate with third-party services or your own backend to keep everything in sync.',
                de: 'Richte Webhooks ein, um automatisierte Workflows auszulösen, sobald sich deine Inhalte ändern. Integriere Drittanbieterdienste oder dein eigenes Backend, um alles synchron zu halten.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryCode = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 12,
                de: 12,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Code',
                de: 'Code',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Manage your content with code',
                de: 'Verwalte deine Inhalte mit Code',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Manage content programmatically by using elek.io Core directly within your JavaScript / TypeScript codebase. Create Projects, add Collections and Entries and more.',
                de: 'Verwalte Inhalte programmatisch, indem du elek.io Core direkt in deinem JavaScript- / TypeScript-Code verwendest. Erstelle Projekte, füge Sammlungen und Einträge hinzu und mehr.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryApiClients = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 6,
                de: 6,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'API Clients',
                de: 'API Clients',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Generate API Clients',
                de: 'Generiere API-Clients',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Create typesafe API Clients for your Projects in JavaScript or TypeScript to dynamically read your content locally and remotely via Cloud.',
                de: 'Erstelle typsichere API-Clients für deine Projekte in JavaScript oder TypeScript, um deine Inhalte lokal und remote über die Cloud dynamisch zu lesen.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
        });

      const featureEntryExport = await core.entries.create({
          projectId: project.id,
          collectionId: featuresCollection.id,
          values: {
            size: {
              objectType: 'value',
              valueType: 'number',
              content: {
                en: 6,
                de: 6,
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            keyword: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Export',
                de: 'Exportieren',
              },
            },
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Export your content into JSON files',
                de: 'Exportiere deine Inhalte in JSON-Dateien',
              },
            },
            description: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Export your content into JSON files to use them statically or easily integrate with other tools and workflows. Watch mode allows for automatic exports whenever content changes.',
                de: 'Exportiere deine Inhalte in JSON-Dateien, um sie statisch zu verwenden oder einfach mit anderen Tools und Workflows zu integrieren. Der Watch-Modus ermöglicht automatische Exporte, sobald sich Inhalte ändern.',
              },
            },
            'read-more-link': {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [],
                de: [],
              },
            },
          },
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
              id: uuid(),
              slug: 'name',
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
              id: uuid(),
              slug: 'slug',
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
              id: uuid(),
              slug: 'tagline',
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
              id: uuid(),
              slug: 'short-description',
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
              id: uuid(),
              slug: 'image',
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
              id: uuid(),
              isGroup: true,
              label: {
                en: 'Features',
                de: 'Funktionen',
              },
              description: {
                en: 'A group of features for this product.',
                de: 'Eine Gruppe von Funktionen für dieses Produkt.',
              },
              fieldDefinitions: [
                {
                  id: uuid(),
                  slug: 'feature-description',
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
                  id: uuid(),
                  slug: 'features',
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
            },
          ],
        });

      const productEntryDesktop = await core.entries.create({
          projectId: project.id,
          collectionId: productsCollection.id,
          values: {
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'elek.io Desktop',
                de: 'elek.io Desktop',
              },
            },
            slug: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'desktop',
                de: 'desktop',
              },
            },
            tagline: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'The offline-first CMS',
                de: 'Das Offline-First-CMS',
              },
            },
            'short-description': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: "Manage your content locally, even when you're offline - no server needed. Sync changes when you're back online.",
                de: 'Verwalte deine Inhalte lokal, auch wenn du offline bist - kein Server erforderlich. Synchronisiere Änderungen, wenn du wieder online bist.',
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            'feature-description': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Too long',
                de: 'Zu lang',
              },
            },
            features: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [
                  {
                    objectType: 'entry',
                    id: featureEntryProjects.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryAssets.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryCollections.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryEntries.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryHistory.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryTeamwork.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryIntegrate.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryOfflineFirst.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryPerformanceAndSecurity.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryFreeAndSourceAvailable.id,
                    collectionId: featuresCollection.id,
                  },
                ],
                de: [
                  {
                    objectType: 'entry',
                    id: featureEntryProjects.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryAssets.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryCollections.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryEntries.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryHistory.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryTeamwork.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryIntegrate.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryOfflineFirst.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryPerformanceAndSecurity.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryFreeAndSourceAvailable.id,
                    collectionId: featuresCollection.id,
                  },
                ],
              },
            },
          },
        });

      const productEntryCloud = await core.entries.create({
          projectId: project.id,
          collectionId: productsCollection.id,
          values: {
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'elek.io Cloud',
                de: 'elek.io Cloud',
              },
            },
            slug: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'cloud',
                de: 'cloud',
              },
            },
            tagline: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'The Content Delivery API',
                de: 'Die Content Delivery API',
              },
            },
            'short-description': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Host your content globally available with minimum latency. Connect APIs and webhooks easily with elek.io Cloud.',
                de: 'Mache deine Inhalte weltweit mit minimaler Latenz verfügbar. Verbinde APIs und Webhooks einfach mit elek.io Cloud.',
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            'feature-description': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'elek.io Cloud is a globally distributed content delivery API that ensures your content is always available with minimal latency, no matter where your users are located.',
                de: 'elek.io Cloud ist eine global verteilte Content Delivery API, die sicherstellt, dass deine Inhalte immer mit minimaler Latenz verfügbar sind, egal wo sich deine Nutzer befinden.',
              },
            },
            features: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [
                  {
                    objectType: 'entry',
                    id: featureEntryInstant.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryReplication.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryAutomation.id,
                    collectionId: featuresCollection.id,
                  },
                ],
                de: [
                  {
                    objectType: 'entry',
                    id: featureEntryInstant.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryReplication.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryAutomation.id,
                    collectionId: featuresCollection.id,
                  },
                ],
              },
            },
          },
        });

      const productEntryCore = await core.entries.create({
          projectId: project.id,
          collectionId: productsCollection.id,
          values: {
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'elek.io Core',
                de: 'elek.io Core',
              },
            },
            slug: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'core',
                de: 'core',
              },
            },
            tagline: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Generate API Clients and export content',
                de: 'Generiere API-Clients und exportiere Inhalte',
              },
            },
            'short-description': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Programmatically manage your content, generate JavaScript / TypeScript API Clients and use our CLI tool to export content.',
                de: 'Verwalte deine Inhalte programmgesteuert, generiere JavaScript / TypeScript API-Clients und verwende unser CLI-Tool, um Inhalte zu exportieren.',
              },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
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
            'feature-description': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'elek.io Core additionally to using the build in API of elek.io Desktop, gives you multiple other ways to interact with your content.',
                de: 'elek.io Core zusätzlich zur Verwendung der integrierten API von elek.io Desktop bietet dir mehrere andere Möglichkeiten, mit deinen Inhalten zu interagieren.',
              },
            },
            features: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [
                  {
                    objectType: 'entry',
                    id: featureEntryCode.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryApiClients.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryExport.id,
                    collectionId: featuresCollection.id,
                  },
                ],
                de: [
                  {
                    objectType: 'entry',
                    id: featureEntryCode.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryApiClients.id,
                    collectionId: featuresCollection.id,
                  },
                  {
                    objectType: 'entry',
                    id: featureEntryExport.id,
                    collectionId: featuresCollection.id,
                  },
                ],
              },
            },
          },
        });

      /**
       * @todo:
       * - Conditional fields based on other field values e.g. if "External Link" is true, the "Target page" field is not visible and the "URL" field is shown.
       */
      const navigationItemComponent = await core.components.create({
          projectId: project.id,
          name: {
            en: 'Navigation Item',
            de: 'Navigationselement',
          },
          slug: 'navigation-item',
          description: {
            en: 'A navigation item that references a product page or an external URL.',
            de: 'Ein Navigationselement, das auf eine Produktseite oder eine externe URL verweist.',
          },
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'name',
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
              id: uuid(),
              slug: 'external-link',
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
              id: uuid(),
              slug: 'target-page',
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
              id: uuid(),
              slug: 'url',
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
              id: uuid(),
              slug: 'name',
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
              id: uuid(),
              slug: 'slug',
              valueType: 'string',
              fieldType: 'text',
              label: {
                en: 'Slug',
                de: 'Slug',
              },
              description: {
                en: 'The slug is unique and used to identify this navigation.',
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
              id: uuid(),
              slug: 'navigation-items',
              valueType: 'component',
              fieldType: 'dynamic',
              ofComponents: [navigationItemComponent.id],
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
              min: 1,
              max: null,
            },
          ],
        });

      await core.entries.create({
          projectId: project.id,
          collectionId: navigationCollection.id,
          values: {
            name: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'Product Navigation',
                de: 'Produkt-Navigation',
              },
            },
            slug: {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'products',
                de: 'produkte',
              },
            },
            'navigation-items': {
              objectType: 'value',
              valueType: 'component',
              content: [
                {
                  componentId: navigationItemComponent.id,
                  values: {
                    name: {
                      objectType: 'value',
                      valueType: 'string',
                      content: {
                        en: 'elek.io Desktop',
                        de: 'elek.io Desktop',
                      },
                    },
                    'external-link': {
                      objectType: 'value',
                      valueType: 'boolean',
                      content: {
                        en: false,
                        de: false,
                      },
                    },
                    'target-page': {
                      objectType: 'value',
                      valueType: 'reference',
                      content: {
                        en: [
                          {
                            objectType: 'entry',
                            id: productEntryDesktop.id,
                            collectionId: productsCollection.id,
                          },
                        ],
                        de: [
                          {
                            objectType: 'entry',
                            id: productEntryDesktop.id,
                            collectionId: productsCollection.id,
                          },
                        ],
                      },
                    },
                    url: {
                      objectType: 'value',
                      valueType: 'string',
                      content: {},
                    },
                  },
                },
                {
                  componentId: navigationItemComponent.id,
                  values: {
                    name: {
                      objectType: 'value',
                      valueType: 'string',
                      content: {
                        en: 'elek.io Cloud',
                        de: 'elek.io Cloud',
                      },
                    },
                    'external-link': {
                      objectType: 'value',
                      valueType: 'boolean',
                      content: {
                        en: false,
                        de: false,
                      },
                    },
                    'target-page': {
                      objectType: 'value',
                      valueType: 'reference',
                      content: {
                        en: [
                          {
                            objectType: 'entry',
                            id: productEntryCloud.id,
                            collectionId: productsCollection.id,
                          },
                        ],
                        de: [
                          {
                            objectType: 'entry',
                            id: productEntryCloud.id,
                            collectionId: productsCollection.id,
                          },
                        ],
                      },
                    },
                    url: {
                      objectType: 'value',
                      valueType: 'string',
                      content: {},
                    },
                  },
                },
                {
                  componentId: navigationItemComponent.id,
                  values: {
                    name: {
                      objectType: 'value',
                      valueType: 'string',
                      content: {
                        en: 'elek.io Core',
                        de: 'elek.io Core',
                      },
                    },
                    'external-link': {
                      objectType: 'value',
                      valueType: 'boolean',
                      content: {
                        en: false,
                        de: false,
                      },
                    },
                    'target-page': {
                      objectType: 'value',
                      valueType: 'reference',
                      content: {
                        en: [
                          {
                            objectType: 'entry',
                            id: productEntryCore.id,
                            collectionId: productsCollection.id,
                          },
                        ],
                        de: [
                          {
                            objectType: 'entry',
                            id: productEntryCore.id,
                            collectionId: productsCollection.id,
                          },
                        ],
                      },
                    },
                    url: {
                      objectType: 'value',
                      valueType: 'string',
                      content: {},
                    },
                  },
                },
              ],
            },
          },
        });

      await core.projects.delete({ id: project.id, force: true });
    }
  );
});
