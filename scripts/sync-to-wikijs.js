#!/usr/bin/env node
/**
 * Syncs markdown files from a folder into Wiki.js as pages, via the GraphQL API.
 * Also converts Obsidian-specific syntax to Wiki.js-compatible equivalents:
 *   - YAML frontmatter -> page title/description/tags (stripped from visible content)
 *   - [!callout] blocks -> Wiki.js styled blockquotes ({.is-info}, {.is-warning}, etc.)
 *   - [[wikilinks]] -> standard markdown links pointing at the correct synced page
 *
 * Required env vars:
 *   WIKIJS_URL   - e.g. https://wiki.example.com (no trailing slash needed)
 *   WIKIJS_TOKEN - API token generated in Wiki.js Admin -> API Access
 *
 * Optional env vars:
 *   SOURCE_DIR         - folder to read .md files from (default: "PublicLore")
 *   WIKIJS_LOCALE      - page locale (default: "en")
 *   WIKIJS_PATH_PREFIX - prepend this to every generated page path, e.g. "lore"
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const WIKI_URL = process.env.WIKIJS_URL;
const TOKEN = process.env.WIKIJS_TOKEN;
const SOURCE_DIR = process.env.SOURCE_DIR || 'PublicLore';
const LOCALE = process.env.WIKIJS_LOCALE || 'en';
const PATH_PREFIX = (process.env.WIKIJS_PATH_PREFIX || '').replace(/^\/|\/$/g, '');

if (!WIKI_URL || !TOKEN) {
  console.error('Error: WIKIJS_URL and WIKIJS_TOKEN environment variables are required.');
  process.exit(1);
}

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`Error: source directory "${SOURCE_DIR}" does not exist.`);
  process.exit(1);
}

const ENDPOINT = `${WIKI_URL.replace(/\/$/, '')}/graphql`;
let hadErrors = false;
const linkWarnings = [];

// ---------- GraphQL ----------

async function gql(query, variables) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    const cause = err.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
    throw new Error(`Network error reaching ${ENDPOINT}: ${err.message}${cause}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}

// ---------- File discovery & path/slug helpers ----------

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function slugify(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_/]/g, '');
}

// Converts a file path like "PublicLore/Factions/The Order.md" into a
// Wiki.js page path like "factions/the-order" (optionally prefixed).
function toPagePath(filePath) {
  let rel = path.relative(SOURCE_DIR, filePath).replace(/\.md$/i, '');
  rel = rel.split(path.sep).join('/');
  rel = rel.split('/').map(slugify).join('/');
  return PATH_PREFIX ? `${PATH_PREFIX}/${rel}` : rel;
}

// Uses the first "# Heading" in the body as a fallback title.
function extractH1Title(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

// Maps note titles/relative-paths (as used in Obsidian [[links]]) to their
// resolved Wiki.js page path, so wikilinks can be converted correctly.
function buildLinkMap(files) {
  const map = new Map();
  for (const file of files) {
    const pagePath = toPagePath(file);
    const base = path.basename(file, '.md');
    map.set(base.toLowerCase(), pagePath);

    const rel = path.relative(SOURCE_DIR, file).replace(/\.md$/i, '').split(path.sep).join('/');
    map.set(rel.toLowerCase(), pagePath);
  }
  return map;
}

// ---------- Obsidian syntax conversion ----------

const CALLOUT_STYLE_MAP = {
  note: 'is-info', info: 'is-info', abstract: 'is-info', summary: 'is-info', tldr: 'is-info',
  example: 'is-info', quote: 'is-info', cite: 'is-info',
  tip: 'is-success', hint: 'is-success', important: 'is-success', success: 'is-success',
  check: 'is-success', done: 'is-success',
  question: 'is-warning', help: 'is-warning', faq: 'is-warning', warning: 'is-warning',
  caution: 'is-warning', attention: 'is-warning',
  failure: 'is-danger', fail: 'is-danger', missing: 'is-danger', danger: 'is-danger',
  error: 'is-danger', bug: 'is-danger',
};

// Converts Obsidian "> [!type] Title" callout blocks into Wiki.js's
// styled blockquote syntax: > **Title** ... {.is-xxx}
function convertCallouts(content) {
  const lines = content.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const calloutMatch = lines[i].match(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/);
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      const customTitle = calloutMatch[2].trim();
      const style = CALLOUT_STYLE_MAP[type] || 'is-info';
      const title = customTitle || (type.charAt(0).toUpperCase() + type.slice(1));

      const bodyLines = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }

      output.push(`> **${title}**`);
      output.push('>');
      for (const bl of bodyLines) {
        output.push(bl.trim() === '' ? '>' : `> ${bl}`);
      }
      output.push(`{.${style}}`);
      output.push('');
    } else {
      output.push(lines[i]);
      i++;
    }
  }

  return output.join('\n');
}

// Converts [[Note]], [[Note|Alias]], [[Note#Heading]], [[Note#Heading|Alias]]
// into standard markdown links pointing at the resolved Wiki.js page path.
function convertWikilinks(content, linkMap, filePath) {
  return content.replace(/\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (match, notePathRaw, headingRaw, aliasRaw) => {
    const noteKey = notePathRaw.trim();
    const target = linkMap.get(noteKey.toLowerCase());

    if (!target) {
      linkWarnings.push(`  [[${noteKey}]] in ${filePath} (not found among synced files)`);
      return aliasRaw ? aliasRaw.trim() : noteKey;
    }

    let url = `/${target}`;
    if (headingRaw) {
      url += `#${slugify(headingRaw.slice(1))}`;
    }
    const label = aliasRaw ? aliasRaw.trim() : noteKey;
    return `[${label}](${url})`;
  });
}

// ---------- Sync ----------

async function upsertPage(filePath, linkMap) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw); // splits YAML frontmatter from body
  const frontmatter = parsed.data || {};

  let body = parsed.content;
  body = convertCallouts(body);
  body = convertWikilinks(body, linkMap, filePath);

  const pagePath = toPagePath(filePath);
  const fallbackTitle = path.basename(filePath, '.md');
  const title = frontmatter.title || extractH1Title(body, fallbackTitle);
  const description = frontmatter.description || '';

  let tags = [];
  if (Array.isArray(frontmatter.tags)) {
    tags = frontmatter.tags.map(String);
  } else if (typeof frontmatter.tags === 'string') {
    tags = frontmatter.tags.split(',').map((t) => t.trim()).filter(Boolean);
  }

  let existingId = null;
  try {
    const existing = await gql(
      `query ($path: String!, $locale: String!) {
        pages { singleByPath(path: $path, locale: $locale) { id } }
      }`,
      { path: pagePath, locale: LOCALE }
    );
    existingId = existing?.pages?.singleByPath?.id ?? null;
  } catch (err) {
    existingId = null; // page doesn't exist yet - treat as new
  }

  if (existingId) {
    console.log(`Updating:  /${pagePath}  (id ${existingId})`);
    const data = await gql(
      `mutation ($id: Int!, $title: String!, $content: String!, $description: String!, $locale: String!, $tags: [String]!) {
        pages {
          update(
            id: $id
            title: $title
            content: $content
            description: $description
            editor: "markdown"
            isPublished: true
            isPrivate: false
            locale: $locale
            tags: $tags
          ) {
            responseResult { succeeded errorCode message }
          }
        }
      }`,
      { id: existingId, title, content: body, description, locale: LOCALE, tags }
    );
    if (!data.pages.update.responseResult.succeeded) {
      console.error(`  Failed: ${data.pages.update.responseResult.message}`);
      hadErrors = true;
    }
  } else {
    console.log(`Creating:  /${pagePath}`);
    const data = await gql(
      `mutation ($title: String!, $content: String!, $description: String!, $path: String!, $locale: String!, $tags: [String]!) {
        pages {
          create(
            title: $title
            content: $content
            description: $description
            editor: "markdown"
            isPublished: true
            isPrivate: false
            locale: $locale
            path: $path
            tags: $tags
          ) {
            responseResult { succeeded errorCode message }
          }
        }
      }`,
      { title, content: body, description, path: pagePath, locale: LOCALE, tags }
    );
    if (!data.pages.create.responseResult.succeeded) {
      console.error(`  Failed: ${data.pages.create.responseResult.message}`);
      hadErrors = true;
    }
  }
}

async function main() {
  console.log(`Wiki.js endpoint: ${ENDPOINT}`);
  console.log(`Source directory: ${SOURCE_DIR}`);
  console.log(`Locale: ${LOCALE}${PATH_PREFIX ? `, path prefix: ${PATH_PREFIX}` : ''}\n`);

  const files = walk(SOURCE_DIR);
  console.log(`Found ${files.length} markdown file(s) under "${SOURCE_DIR}"\n`);

  const linkMap = buildLinkMap(files);

  for (const file of files) {
    try {
      await upsertPage(file, linkMap);
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
      hadErrors = true;
    }
  }

  if (linkWarnings.length) {
    console.warn(`\n${linkWarnings.length} wikilink(s) could not be resolved (left as plain text):`);
    for (const w of linkWarnings) console.warn(w);
  }

  if (hadErrors) {
    console.error('\nOne or more pages failed to sync. Failing the job.');
    process.exitCode = 1;
  } else {
    console.log('\nAll pages synced successfully.');
  }
}

main();
