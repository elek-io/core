import { z } from 'zod';
import { uuidSchema } from './baseSchema.js';

const outDirSchema = z.string().default('./.elek.io');
const languageSchema = z.enum(['ts', 'js']).default('ts');
const formatSchema = z.enum(['esm', 'cjs']).default('esm');
const targetSchema = z
  .enum([
    'es3',
    'es5',
    'es6',
    'es2015',
    'es2016',
    'es2017',
    'es2018',
    'es2019',
    'es2020',
    'es2021',
    'es2022',
    'es2023',
    'es2024',
    'esnext',
  ])
  .default('es2020');
const projectsSchema = z
  .string()
  .default('all')
  .transform((value) => {
    if (value === 'all') {
      return 'all';
    }

    return value.split(',').map((v) => uuidSchema.parse(v.trim()));
  });
const generateApiClientOptionsSchema = z.object({
  watch: z.boolean().default(false),
});
const exportProjectsOptionsSchema = generateApiClientOptionsSchema.extend({
  separate: z.boolean().default(false),
});

export const generateApiClientSchema = z.object({
  outDir: outDirSchema,
  language: languageSchema,
  format: formatSchema,
  target: targetSchema,
  options: generateApiClientOptionsSchema,
});
export type GenerateApiClientProps = z.infer<typeof generateApiClientSchema>;

const portSchema = z
  .string()
  .default('31310')
  .transform((value, context) => {
    try {
      const parsed = parseInt(value);

      return parsed;
    } catch (_error) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid port number',
        input: value,
      });

      // this is a special constant with type `never`
      // returning it lets you exit the transform without impacting the inferred return type
      return z.NEVER;
    }
  });

export const apiStartSchema = z.object({
  port: portSchema,
});
export type ApiStartProps = z.infer<typeof apiStartSchema>;

export const exportSchema = z.object({
  outDir: outDirSchema,
  projects: projectsSchema,
  options: exportProjectsOptionsSchema,
});
export type ExportProps = z.infer<typeof exportSchema>;
