#!/usr/bin/env node
/**
 * Lists every page currently in Wiki.js (id, path, title), sorted by path.
 * Use this to identify which page IDs are junk/leftovers before running delete-pages.js.
 *
 * Required env vars:
 *   WIKIJS_URL   - e.g. https://wiki.example.com
 *   WIKIJS_TOKEN - API token with at least read:pages scope
 */

const WIKI_URL = process.env.WIKIJS_URL;
const TOKEN = process.env.WIKIJS_TOKEN;

if (!WIKI_URL || !TOKEN) {
  console.error('Error: WIKIJS_URL and WIKIJS_TOKEN environment variables are required.');
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function main() {
  const data = await gql(`query { pages { list { id path title } } }`);
  const pages = data.pages.list.slice().sort((a, b) => a.path.localeCompare(b.path));

  console.log(`Total pages: ${pages.length}\n`);
  console.log('ID\tPATH\tTITLE');
  for (const p of pages) {
    console.log(`${p.id}\t${p.path}\t${p.title}`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
