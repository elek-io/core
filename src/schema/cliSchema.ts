import { z } from 'zod';

const outDirSchema = z.string().default('./.elek-io');
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
const optionsSchema = z.object({ watch: z.boolean().default(false) });

export const generateApiClientAsSchema = z.object({
  outDir: outDirSchema,
  language: languageSchema,
  format: formatSchema,
  target: targetSchema,
});
export type GenerateApiClientAsProps = z.infer<
  typeof generateApiClientAsSchema
>;

export const generateApiClientActionSchema = z.function({
  input: z.tuple([
    outDirSchema,
    languageSchema,
    formatSchema,
    targetSchema,
    optionsSchema,
  ]),
  output: z.void(),
});

const portSchema = z.number().default(31310);

export const apiStartActionSchema = z.function({
  input: z.tuple([portSchema]),
  output: z.void(),
});

export const exportProjectsSchema = z.object({
  outDir: outDirSchema,
});
export type ExportProjectsProps = z.infer<typeof exportProjectsSchema>;

export const exportActionSchema = z.function({
  input: z.tuple([outDirSchema, optionsSchema]),
  output: z.void(),
});
