import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fs from 'fs-extra';
import ts from 'typescript';

/**
 * The machine checkable half of the documentation rules.
 *
 * Rules live here rather than in the test so the baseline can be regenerated
 * without a test runner. The half no machine can check is in
 * contributing/documentation.md.
 */
export const repositoryRoot = Path.resolve(
  Path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** The doc that explains every rule, quoted in each failure message. */
export const rulesDoc = 'contributing/documentation.md';

/** Longest a single prose paragraph or list item may be, in characters. */
const maxParagraphLength = 400;

/** Most paragraphs allowed in a row without a list, table, fence or heading. */
const maxProseRun = 3;

/** Most content lines allowed between one heading and the next. */
const maxSectionLength = 45;

/** Most lines a JSDoc block may span before its reasoning belongs in a doc. */
const maxJsdocBlockLength = 12;

/** Tags a JSDoc block may use. The rest restate what the types already state. */
const allowedJsdocTags = new Set([
  'param',
  'returns',
  'throws',
  'example',
  'see',
  'default',
  'deprecated',
  'todo',
]);

/** `ts` and `js` are deliberately absent, they duplicate the long form. */
const allowedFenceLanguages = new Set([
  '',
  'typescript',
  'tsx',
  'javascript',
  'astro',
  'bash',
  'json',
  'jsonc',
  'yaml',
  'diff',
  'markdown',
  'mermaid',
  'text',
]);

/**
 * Words that stay capitalized mid-heading. Acronyms pass automatically, so this
 * holds only mixed-case names: the domain nouns and the products Core names.
 */
const capitalizedWords = new Set([
  'Project',
  'Collection',
  'Component',
  'Entry',
  'Entries',
  'Value',
  'Asset',
  'Release',
  'User',
  'Core',
  'Astro',
  'Git',
  'GitHub',
  'Actions',
  'TypeScript',
  'JavaScript',
  'Node',
  'Markdown',
  'Desktop',
  'Cloud',
  'Windows',
  'Linux',
  'macOS',
  'Zod',
  'Vite',
  'Vitest',
  'Prettier',
  'ESLint',
  'Sentry',
  'Strapi',
  'Directus',
  'Payload',
  'TinaCMS',
  'Contentful',
  'Sanity',
  'Starlight',
  'Vercel',
  'Netlify',
  'Cloudflare',
  'Pages',
]);

/**
 * Repositories other than Core. A source path belonging to one of these is not
 * expected to exist here, so the line has to name the repository.
 */
const externalRepositories = [
  'Desktop',
  'Cloud',
  'dugite',
  'GitHub Desktop',
  'VS Code',
  'Astro',
  'Client',
];

/** Words that read as filler or marketing. Plain alternatives are in the rules doc. */
const blockedWords = [
  'additionally',
  'crucial',
  'delve',
  'seamless',
  'seamlessly',
  'robust',
  'powerful',
  'leverage',
  'leverages',
  'leveraging',
  'utilize',
  'utilizes',
  'utilizing',
  'facilitate',
  'facilitates',
  'showcase',
  'showcases',
  'tapestry',
  'testament',
  'pivotal',
  'garner',
  'intricate',
  'enduring',
  'vibrant',
  'groundbreaking',
  'renowned',
  'enhance',
  'enhances',
  'interplay',
  'substrate',
  'nexus',
  'bedrock',
  'modality',
  'paradigm',
  'flywheel',
  'endgame',
];

/** Phrases with a shorter plain form, and metaphors with a concrete alternative. */
const blockedPhrases = [
  'in order to',
  'it is important to note',
  'it should be noted',
  'due to the fact that',
  'a wide range of',
  'a variety of',
  'when it comes to',
  'worth noting',
  'under the hood',
  'best practice',
  'api surface',
  'north star',
  'gold-plating',
];

/**
 * Words that date a sentence. Consumer docs ship versioned with the code, so
 * what is true is whatever that version does.
 */
const temporalWords = [
  'currently',
  'recently',
  'at the moment',
  'as of today',
  'for now',
  'at this time',
];

export interface Violation {
  file: string;
  line: number;
  message: string;
}

/**
 * One checkable rule. `files` picks what it reads, `check` returns every
 * violation found in a single file.
 */
export interface Rule {
  id: string;
  summary: string;
  files: () => string[];
  check: (file: string, content: string) => Violation[];
}

interface MarkdownLine {
  number: number;
  text: string;
  inFence: boolean;
}

interface MarkdownLink {
  target: string;
  line: number;
}

interface JsdocBlock {
  startLine: number;
  lines: string[];
}

export function readFile(file: string): string {
  return Fs.readFileSync(Path.join(repositoryRoot, file), 'utf8');
}

export function exists(file: string): boolean {
  return Fs.pathExistsSync(Path.join(repositoryRoot, file));
}

/** Lists every file below the given directories that matches, repository relative. */
function filesIn(directories: string[], matches: (name: string) => boolean) {
  const found: string[] = [];
  for (const directory of directories) {
    const absolute = Path.join(repositoryRoot, directory);
    if (!Fs.pathExistsSync(absolute)) continue;
    for (const entry of Fs.readdirSync(absolute, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!entry.isFile() || !matches(entry.name)) continue;
      const file = Path.join(entry.parentPath, entry.name);
      found.push(Path.relative(repositoryRoot, file).replaceAll('\\', '/'));
    }
  }
  return found.toSorted();
}

function markdownFilesIn(...directories: string[]): string[] {
  return filesIn(directories, (name) => name.endsWith('.md'));
}

const documentationFiles = () => markdownFilesIn('docs');
const contributingFiles = () => markdownFilesIn('contributing');
const planFiles = () => markdownFilesIn('plans');
const sourceFiles = () => filesIn(['src'], (name) => name.endsWith('.ts'));

/** What the coverage rule reads. A test documents nobody, so it is left out. */
const productionSourceFiles = () =>
  sourceFiles().filter(
    (file) => !file.endsWith('.test.ts') && !file.startsWith('src/test/')
  );
const rootFiles = () =>
  ['AGENTS.md', 'README.md'].filter((file) => exists(file));

/** Everything a style rule shapes. Plans are out, a captured idea is a draft. */
const styledFiles = () => [
  ...documentationFiles(),
  ...contributingFiles(),
  ...rootFiles(),
];

/** Every markdown file, for the rules that check correctness rather than shape. */
const allMarkdownFiles = () => [...styledFiles(), ...planFiles()];

/** Splits into lines, marking the ones inside a fenced code block. */
function linesOf(content: string): MarkdownLine[] {
  let inFence = false;
  return content.split('\n').map((text, index) => {
    const isDelimiter = text.trimStart().startsWith('```');
    const line = { number: index + 1, text, inFence: inFence || isDelimiter };
    if (isDelimiter) inFence = !inFence;
    return line;
  });
}

/** True for a paragraph of prose, false for headings, lists, tables and quotes. */
function isProse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  return !/^(#{1,6}\s|[-*+]\s|>|\||\d+\.\s|<)/.test(trimmed);
}

/** True for a list item, so the length rules cover it like a paragraph. */
function isListItem(text: string): boolean {
  return /^\s*([-*+]|\d+\.)\s/.test(text);
}

/** Removes inline code, whose contents follow the code rules, not the prose rules. */
function withoutInlineCode(text: string): string {
  return text.replaceAll(/`[^`]*`/g, '');
}

/** Turns a heading into the anchor GitHub generates for it. */
function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .replaceAll(/\s+/g, '-');
}

/** Every anchor a markdown file offers, taken from its headings. */
function anchorsOf(content: string): Set<string> {
  const anchors = new Set<string>();
  for (const line of linesOf(content)) {
    if (line.inFence) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line.text);
    if (heading?.[1]) anchors.add(anchorOf(heading[1]));
  }
  return anchors;
}

/** Collects every markdown link target outside code fences. */
function linksOf(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  for (const line of linesOf(content)) {
    if (line.inFence) continue;
    for (const match of line.text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (match[1]) links.push({ target: match[1], line: line.number });
    }
  }
  return links;
}

function isExternalLink(target: string): boolean {
  return /^(https?:|mailto:)/.test(target);
}

/** Resolves a link target against the linking file, dropping any anchor. */
function resolveTarget(file: string, target: string): string {
  const path = target.split('#')[0] ?? '';
  if (path === '') return file;
  return Path.posix.normalize(Path.posix.join(Path.dirname(file), path));
}

/** Collects every JSDoc block in a TypeScript file. */
function jsdocBlocksOf(content: string): JsdocBlock[] {
  const blocks: JsdocBlock[] = [];
  let current: JsdocBlock | null = null;
  for (const [index, text] of content.split('\n').entries()) {
    const trimmed = text.trim();
    if (current === null) {
      if (!trimmed.startsWith('/**')) continue;
      current = { startLine: index + 1, lines: [text] };
    } else {
      current.lines.push(text);
    }
    if (trimmed.includes('*/')) {
      blocks.push(current);
      current = null;
    }
  }
  return blocks;
}

/** A symbol the coverage rule requires a JSDoc block on. */
interface ExportedSymbol {
  name: string;
  line: number;
  hasBlock: boolean;
}

/** True when a node carries a block, its own or the variable statement's. */
let classMemberCache: Map<string, Set<string>> | null = null;

/**
 * Maps every class Core declares to its member names, so a comment naming
 * `Class.member` can be resolved. Built once, it parses every source file.
 */
function classMembers(): Map<string, Set<string>> {
  if (classMemberCache !== null) return classMemberCache;

  const members = new Map<string, Set<string>>();
  for (const file of sourceFiles()) {
    const source = ts.createSourceFile(
      file,
      readFile(file),
      ts.ScriptTarget.Latest,
      true
    );
    const walk = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const known = members.get(node.name.text) ?? new Set<string>();
        for (const member of node.members) {
          if (member.name) known.add(member.name.getText(source));
        }
        members.set(node.name.text, known);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }

  classMemberCache = members;
  return members;
}

function hasJsdoc(node: ts.Node): boolean {
  return ts.getJSDocCommentsAndTags(node).length > 0;
}

/** True when the node declares any of the given modifiers. */
function hasModifier(node: ts.Node, ...kinds: ts.SyntaxKind[]): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((modifier) =>
    kinds.includes(modifier.kind)
  );
}

/** True for an initializer that makes its declaration a function, not a value. */
function isFunctionInitializer(node: ts.Expression | undefined): boolean {
  if (node === undefined) return false;
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/**
 * Every symbol in a file the coverage rule wants a block on, and whether it has
 * one. Three definitions were counted against the source before this one won:
 *
 * - Every exported symbol, 482 missing. Most are types and zod schemas whose
 *   shape is their own documentation, so the rule would manufacture the noise
 *   that contributing/documentation.md bans.
 * - Only what the four entry points re-export, 28 missing. It misses every
 *   service method, which a consumer reaches through a getter's return type.
 * - Exported functions, classes and their public members, 57 across 24 files.
 */
function exportedSymbolsOf(file: string, content: string): ExportedSymbol[] {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  const symbols: ExportedSymbol[] = [];

  const nameOf = (node: ts.NamedDeclaration) =>
    node.name === undefined ? 'default' : node.name.getText(source);

  const record = (node: ts.Node, name: string) => {
    symbols.push({
      name,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      hasBlock: hasJsdoc(node),
    });
  };

  const recordMembers = (node: ts.ClassDeclaration, className: string) => {
    for (const member of node.members) {
      // The class block covers the constructor, and an internal member
      // documents a contributor through the source it sits in
      if (ts.isConstructorDeclaration(member)) continue;
      if (
        hasModifier(
          member,
          ts.SyntaxKind.PrivateKeyword,
          ts.SyntaxKind.ProtectedKeyword
        )
      )
        continue;

      const name = `${className}.${nameOf(member)}`;
      if (ts.isMethodDeclaration(member)) {
        // An overload signature has no body, the implementation carries it
        if (member.body) record(member, name);
        continue;
      }
      if (ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
        record(member, name);
        continue;
      }
      if (!ts.isPropertyDeclaration(member)) continue;
      const initializer = member.initializer;
      if (isFunctionInitializer(initializer)) {
        record(member, name);
        continue;
      }
      // A property holding an object literal only groups methods, like
      // `public branches = {` in GitService, so the methods inside carry it
      if (
        initializer === undefined ||
        !ts.isObjectLiteralExpression(initializer)
      )
        continue;
      for (const property of initializer.properties) {
        const isMethod =
          ts.isMethodDeclaration(property) ||
          (ts.isPropertyAssignment(property) &&
            isFunctionInitializer(property.initializer));
        if (isMethod) record(property, `${name}.${nameOf(property)}`);
      }
    }
  };

  for (const statement of source.statements) {
    // A re-export carries no declaration, the file it points at does
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.body) record(statement, nameOf(statement));
      continue;
    }
    if (ts.isClassDeclaration(statement)) {
      const className = nameOf(statement);
      record(statement, className);
      recordMembers(statement, className);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!isFunctionInitializer(declaration.initializer)) continue;
      record(declaration, declaration.name.getText(source));
    }
  }

  return symbols;
}

export const rules: Rule[] = [
  {
    id: 'structure/indexed',
    summary: 'every doc is listed in its folder index',
    files: () =>
      ['docs/index.md', 'contributing/index.md', 'plans/index.md'].filter(
        exists
      ),
    check: (file, content) => {
      const directory = Path.dirname(file);
      const linked = new Set(
        linksOf(content).map((link) => resolveTarget(file, link.target))
      );
      return markdownFilesIn(directory)
        .filter((candidate) => candidate !== file && !linked.has(candidate))
        .map((candidate) => ({
          file,
          line: 1,
          message: `${candidate} is not listed in this index`,
        }));
    },
  },
  {
    id: 'structure/single-h1',
    summary: 'one H1, on the first line',
    files: () => [...documentationFiles(), ...contributingFiles()],
    check: (file, content) => {
      const headings = linesOf(content).filter(
        (line) => !line.inFence && line.text.startsWith('# ')
      );
      if (headings.length === 1 && headings[0]?.number === 1) return [];
      return [
        {
          file,
          line: headings[0]?.number ?? 1,
          message: `expected exactly one H1 on line 1, found ${headings.length}`,
        },
      ];
    },
  },
  {
    id: 'structure/lead-paragraph',
    summary: 'a lead paragraph follows the H1',
    files: () => [...documentationFiles(), ...contributingFiles()],
    check: (file, content) => {
      const lines = content.split('\n');
      if (lines[1]?.trim() === '' && isProse(lines[2] ?? '')) return [];
      return [
        {
          file,
          line: 3,
          message:
            'the H1 needs a blank line and then a lead paragraph saying what this doc covers',
        },
      ];
    },
  },
  {
    id: 'structure/see-also',
    summary: 'a See also section closes the doc',
    files: () =>
      [...documentationFiles(), ...contributingFiles()].filter(
        (file) => Path.basename(file) !== 'index.md'
      ),
    check: (file, content) => {
      const sections = linesOf(content).filter(
        (line) => !line.inFence && line.text.startsWith('## ')
      );
      const last = sections.at(-1);
      if (last?.text.trim() === '## See also') return [];
      return [
        {
          file,
          line: last?.number ?? 1,
          message: `the last section has to be "## See also", found ${last?.text.trim() ?? 'no section at all'}`,
        },
      ];
    },
  },
  {
    id: 'links/resolve',
    summary: 'every relative link resolves, anchors included',
    files: allMarkdownFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const link of linksOf(content)) {
        if (isExternalLink(link.target)) continue;
        const target = resolveTarget(file, link.target);
        if (!exists(target)) {
          violations.push({
            file,
            line: link.line,
            message: `link target ${target} does not exist`,
          });
          continue;
        }
        const anchor = link.target.split('#')[1];
        if (anchor === undefined || !target.endsWith('.md')) continue;
        if (!anchorsOf(readFile(target)).has(anchor)) {
          violations.push({
            file,
            line: link.line,
            message: `${target} has no heading anchored at #${anchor}`,
          });
        }
      }
      return violations;
    },
  },
  {
    id: 'links/docs-self-contained',
    summary: 'docs never link outside docs, they ship without the repository',
    files: documentationFiles,
    check: (file, content) =>
      linksOf(content)
        .filter(
          (link) => !isExternalLink(link.target) && !link.target.startsWith('#')
        )
        .filter((link) => !resolveTarget(file, link.target).startsWith('docs/'))
        .map((link) => ({
          file,
          line: link.line,
          message: `${link.target} leaves docs/, which ships without the repository. Use an absolute https://github.com/elek-io/core/blob/main/ URL`,
        })),
  },
  {
    id: 'links/no-plans',
    summary: 'docs and contributing never link into plans',
    files: () => [...documentationFiles(), ...contributingFiles()],
    check: (file, content) =>
      linksOf(content)
        .filter((link) => link.target.includes('plans/'))
        .map((link) => ({
          file,
          line: link.line,
          message: `${link.target} points into plans/, which is deleted once the work ships`,
        })),
  },
  {
    id: 'links/source-paths',
    summary: 'a cited source path exists, or the line names its repository',
    files: () => [...contributingFiles(), ...planFiles(), ...rootFiles()],
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const line of linesOf(content)) {
        if (line.inFence) continue;
        const paths = line.text.matchAll(/\bsrc\/[A-Za-z0-9/._-]+\.tsx?\b/g);
        for (const [path] of paths) {
          if (exists(path)) continue;
          if (externalRepositories.some((name) => line.text.includes(name)))
            continue;
          violations.push({
            file,
            line: line.number,
            message: `${path} is not in Core, and the line does not name the repository it belongs to`,
          });
        }
      }
      return violations;
    },
  },
  {
    id: 'links/jsdoc-see',
    summary: 'every @see path in the source resolves',
    files: sourceFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const [index, text] of content.split('\n').entries()) {
        const target = /@see\s+\{?@?link\s*([^}\s]+)\}?|@see\s+([^\s{}]+)/
          .exec(text)
          ?.slice(1)
          .find(Boolean);
        if (target === undefined) continue;
        if (isExternalLink(target) || !/\.(md|ts)$/.test(target)) continue;
        const relative = resolveTarget(file, target);
        if (exists(relative) || exists(target)) continue;
        violations.push({
          file,
          line: index + 1,
          message: `@see ${target} resolves to neither ${relative} nor ${target}`,
        });
      }
      return violations;
    },
  },
  {
    id: 'prose/punctuation',
    summary: 'no em dashes, en dashes as dashes, or curly quotes',
    files: allMarkdownFiles,
    check: (file, content) =>
      linesOf(content)
        .filter((line) => !line.inFence && /[—–‘’“”]/.test(line.text))
        .map((line) => ({
          file,
          line: line.number,
          message: `contains ${[...new Set(line.text.match(/[—–‘’“”]/g))].join(' ')}, use a period, a comma or a straight quote`,
        })),
  },
  {
    id: 'prose/sentence-case-headings',
    summary: 'headings are sentence case',
    files: styledFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const line of linesOf(content)) {
        if (line.inFence) continue;
        const heading = /^#{1,6}\s+(.*)$/.exec(line.text);
        if (!heading?.[1]) continue;
        const words = withoutInlineCode(heading[1]).split(/\s+/).slice(1);
        for (const part of words.flatMap((word) => word.split('-'))) {
          const bare = part.replaceAll(/[^\p{L}\p{N}.]/gu, '');
          if (bare === '' || !/^\p{Lu}/u.test(bare)) continue;
          if (/^[\p{Lu}\p{N}]+$/u.test(bare) || bare.includes('.')) continue;
          if (capitalizedWords.has(bare)) continue;
          if (capitalizedWords.has(bare.replace(/s$/, ''))) continue;
          violations.push({
            file,
            line: line.number,
            message: `heading is not sentence case, "${bare}" is capitalized mid-heading`,
          });
        }
      }
      return violations;
    },
  },
  {
    id: 'prose/fence-language',
    summary: 'code fences use the agreed language tags',
    files: styledFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      let inFence = false;
      for (const [index, text] of content.split('\n').entries()) {
        const trimmed = text.trimStart();
        if (!trimmed.startsWith('```')) continue;
        const language = trimmed.slice(3).trim();
        if (!inFence && !allowedFenceLanguages.has(language)) {
          violations.push({
            file,
            line: index + 1,
            message: `fence language "${language}" is not allowed, use one of ${[...allowedFenceLanguages].filter(Boolean).join(', ')}`,
          });
        }
        inFence = !inFence;
      }
      return violations;
    },
  },
  {
    id: 'prose/vocabulary',
    summary: 'no filler words, marketing words or abstract metaphors',
    files: styledFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const line of linesOf(content)) {
        if (line.inFence) continue;
        const text = withoutInlineCode(line.text).toLowerCase();
        for (const word of blockedWords) {
          if (!new RegExp(`\\b${word}\\b`).test(text)) continue;
          violations.push({
            file,
            line: line.number,
            message: `"${word}" is on the blocked word list, use a plain word`,
          });
        }
        for (const phrase of blockedPhrases) {
          if (!text.includes(phrase)) continue;
          violations.push({
            file,
            line: line.number,
            message: `"${phrase}" is on the blocked phrase list, say it plainly`,
          });
        }
      }
      return violations;
    },
  },
  {
    id: 'prose/inline-header-list',
    summary: 'no bold label ending in a colon that restates the line',
    files: styledFiles,
    check: (file, content) =>
      linesOf(content)
        .filter(
          (line) =>
            !line.inFence && /^\s*(?:[-*+]\s+)?\*\*[^*]+:\*\*/.test(line.text)
        )
        .map((line) => ({
          file,
          line: line.number,
          message:
            'a bold label ending in a colon restates the line, end the label with a period or write prose',
        })),
  },
  {
    id: 'prose/no-temporal-words',
    summary: 'consumer docs carry no words that date them',
    files: documentationFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const line of linesOf(content)) {
        if (line.inFence) continue;
        const text = withoutInlineCode(line.text).toLowerCase();
        for (const word of temporalWords) {
          if (!text.includes(word)) continue;
          violations.push({
            file,
            line: line.number,
            message: `"${word}" dates the sentence, docs ship versioned with the code`,
          });
        }
      }
      return violations;
    },
  },
  {
    id: 'brevity/paragraph-length',
    summary: `a paragraph or list item stays under ${maxParagraphLength} characters`,
    files: styledFiles,
    check: (file, content) =>
      linesOf(content)
        .filter((line) => !line.inFence)
        .filter((line) => isProse(line.text) || isListItem(line.text))
        .filter((line) => line.text.length > maxParagraphLength)
        .map((line) => ({
          file,
          line: line.number,
          message: `${line.text.length} characters, split it or turn it into a list`,
        })),
  },
  {
    id: 'brevity/prose-run',
    summary: `no more than ${maxProseRun} paragraphs in a row`,
    files: styledFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      let run = 0;
      for (const line of linesOf(content)) {
        if (line.inFence) {
          run = 0;
          continue;
        }
        if (line.text.trim() === '') continue;
        if (!isProse(line.text)) {
          run = 0;
          continue;
        }
        run += 1;
        if (run !== maxProseRun + 1) continue;
        violations.push({
          file,
          line: line.number,
          message: `${run} paragraphs in a row, break them up with a list, table, example or diagram`,
        });
      }
      return violations;
    },
  },
  {
    id: 'brevity/section-length',
    summary: `a section stays under ${maxSectionLength} content lines`,
    files: styledFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      let heading = { text: 'the lead', line: 1 };
      let count = 0;
      const report = () => {
        if (count <= maxSectionLength) return;
        violations.push({
          file,
          line: heading.line,
          message: `${count} content lines under "${heading.text.trim()}", give it subheadings or split the doc`,
        });
      };
      for (const line of linesOf(content)) {
        if (!line.inFence && /^#{1,6}\s/.test(line.text)) {
          report();
          heading = { text: line.text, line: line.number };
          count = 0;
          continue;
        }
        const trimmed = line.text.trimStart();
        if (line.inFence || trimmed === '' || trimmed.startsWith('|')) continue;
        count += 1;
      }
      report();
      return violations;
    },
  },
  {
    id: 'brevity/jsdoc-block-length',
    summary: `a JSDoc block stays under ${maxJsdocBlockLength} lines`,
    files: sourceFiles,
    check: (file, content) =>
      jsdocBlocksOf(content)
        .filter((block) => block.lines.length > maxJsdocBlockLength)
        .map((block) => ({
          file,
          line: block.startLine,
          message: `${block.lines.length} lines, move the reasoning into a contributing/ doc and leave an @see`,
        })),
  },
  {
    id: 'jsdoc/allowed-tags',
    summary: 'JSDoc uses only the agreed tags',
    files: sourceFiles,
    check: (file, content) => {
      const violations: Violation[] = [];
      for (const block of jsdocBlocksOf(content)) {
        for (const [offset, text] of block.lines.entries()) {
          const tag = /^\s*(?:\/\*)?\*?\s*@([a-zA-Z]+)/.exec(text);
          if (!tag?.[1] || allowedJsdocTags.has(tag[1])) continue;
          violations.push({
            file,
            line: block.startLine + offset,
            message: `@${tag[1]} is not allowed, use one of ${[...allowedJsdocTags].join(', ')}`,
          });
        }
      }
      return violations;
    },
  },
  {
    id: 'jsdoc/todo-issue',
    summary: 'every @todo carries its issue URL',
    files: sourceFiles,
    check: (file, content) =>
      content
        .split('\n')
        .map((text, index) => ({ text, number: index + 1 }))
        .filter((line) => /^\s*(\/\/|\/\*|\*)/.test(line.text))
        .filter(
          (line) =>
            /@todo\b/.test(line.text) &&
            !line.text.includes('https://github.com/elek-io/core/issues/')
        )
        .map((line) => ({
          file,
          line: line.number,
          message:
            '@todo needs its issue URL on the same line, otherwise delete it',
        })),
  },
  {
    id: 'jsdoc/documented-export',
    summary: 'every exported function, class and public member carries a block',
    files: productionSourceFiles,
    check: (file, content) =>
      exportedSymbolsOf(file, content)
        .filter((symbol) => !symbol.hasBlock)
        .map((symbol) => ({
          file,
          line: symbol.line,
          message: `${symbol.name} carries no JSDoc block, say what its signature cannot`,
        })),
  },
  {
    id: 'jsdoc/symbol-reference',
    summary: 'a comment naming `Class.member` names one that exists',
    files: sourceFiles,
    check: (file, content) => {
      const members = classMembers();
      const violations: Violation[] = [];
      for (const [index, text] of content.split('\n').entries()) {
        // Only Core's own classes are resolvable, so a reference to anything
        // else is skipped rather than guessed at. A nested `A.b.c` is missed,
        // the reference has to close right after the member.
        if (!/^\s*(\/\/|\/\*|\*)/.test(text)) continue;
        const references = text.matchAll(
          /`([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?:\(\))?`/g
        );
        for (const [, className, member] of references) {
          if (className === undefined || member === undefined) continue;
          const known = members.get(className);
          if (known === undefined || known.has(member)) continue;
          violations.push({
            file,
            line: index + 1,
            message: `${className} has no member "${member}", the reference is stale or names the wrong class`,
          });
        }
      }
      return violations;
    },
  },
];

export interface MermaidBlock {
  file: string;
  line: number;
  code: string;
}

/**
 * Collects every mermaid diagram in the repository's markdown, so the test can
 * hand each to mermaid's own parser. Parsing is async and needs a DOM, which is
 * why this rule lives in the test rather than in the list above.
 */
export function mermaidBlocks(): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  for (const file of allMarkdownFiles()) {
    const lines = readFile(file).split('\n');
    let start: number | null = null;
    for (const [index, text] of lines.entries()) {
      const trimmed = text.trimStart();
      if (start === null) {
        if (trimmed === '```mermaid') start = index + 1;
        continue;
      }
      if (!trimmed.startsWith('```')) continue;
      blocks.push({
        file,
        line: start,
        code: lines.slice(start, index).join('\n'),
      });
      start = null;
    }
  }
  return blocks;
}

/** Runs one rule over every file it applies to. */
export function violationsOf(rule: Rule): Violation[] {
  return rule.files().flatMap((file) => rule.check(file, readFile(file)));
}
