#!/usr/bin/env node
/**
 * Syncs markdown files from a folder into Wiki.js as pages, via the GraphQL API.
 *
 * Required env vars:
 *   WIKIJS_URL   - e.g. https://wiki.example.com (no trailing slash needed)
 *   WIKIJS_TOKEN - API token generated in Wiki.js Admin -> API Access
 *
 * Optional env vars:
 *   SOURCE_DIR         - folder to read .md files from (default: "PublicLore")
 *   WIKIJS_LOCALE      - page locale (default: "en")
 *   WIKIJS_PATH_PREFIX - prepend this to every generated page path, e.g. "lore"
 *                         (leave unset to mirror the folder structure at the root)
 */

import fs from 'fs';
import path from 'path';

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

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}

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

// Converts a file path like "PublicLore/Factions/The Order.md" into a
// Wiki.js page path like "factions/the-order" (optionally prefixed).
function toPagePath(filePath) {
  let rel = path.relative(SOURCE_DIR, filePath).replace(/\.md$/i, '');
  rel = rel.split(path.sep).join('/');
  rel = rel
    .split('/')
    .map((seg) =>
      seg
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
    )
    .join('/');
  return PATH_PREFIX ? `${PATH_PREFIX}/${rel}` : rel;
}

// Uses the first "# Heading" in the file as the title, falling back to the filename.
function extractTitle(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

async function upsertPage(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const pagePath = toPagePath(filePath);
  const fallbackTitle = path.basename(filePath, '.md');
  const title = extractTitle(content, fallbackTitle);

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
    // singleByPath throws if the page doesn't exist yet - that's fine, treat as new.
    existingId = null;
  }

  if (existingId) {
    console.log(`Updating:  /${pagePath}  (id ${existingId})`);
    const data = await gql(
      `mutation ($id: Int!, $title: String!, $content: String!, $locale: String!) {
        pages {
          update(
            id: $id
            title: $title
            content: $content
            description: ""
            editor: "markdown"
            isPublished: true
            isPrivate: false
            locale: $locale
            tags: []
          ) {
            responseResult { succeeded errorCode message }
          }
        }
      }`,
      { id: existingId, title, content, locale: LOCALE }
    );
    if (!data.pages.update.responseResult.succeeded) {
      console.error(`  Failed: ${data.pages.update.responseResult.message}`);
    }
  } else {
    console.log(`Creating:  /${pagePath}`);
    const data = await gql(
      `mutation ($title: String!, $content: String!, $path: String!, $locale: String!) {
        pages {
          create(
            title: $title
            content: $content
            description: ""
            editor: "markdown"
            isPublished: true
            isPrivate: false
            locale: $locale
            path: $path
            tags: []
          ) {
            responseResult { succeeded errorCode message }
          }
        }
      }`,
      { title, content, path: pagePath, locale: LOCALE }
    );
    if (!data.pages.create.responseResult.succeeded) {
      console.error(`  Failed: ${data.pages.create.responseResult.message}`);
    }
  }
}

async function main() {
  const files = walk(SOURCE_DIR);
  console.log(`Found ${files.length} markdown file(s) under "${SOURCE_DIR}"\n`);

  for (const file of files) {
    try {
      await upsertPage(file);
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }
}

main();
