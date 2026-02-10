import { describe, expect, it } from 'vitest';
import ElekIoCore from './index.node.js';

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
    const core = new ElekIoCore();

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
          max: 50,
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
          max: 200,
        },
        {
          id: '6f513d40-297f-4f16-a4d8-cfa9f2a130b4',
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
          max: 200,
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
  });
});
