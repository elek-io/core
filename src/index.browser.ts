// Export all schemas and shared code that works inside browser environments,
// excluding all code that requires filesystem access / git integration etc.
export * from './schema/index.js';
export * from './util/shared.js';

// Also export the type of ElekIoCore but not the code itself
// This is needed to be able to import and use the type inside the preload script
export type { default as ElekIoCore } from './index.node.js';
