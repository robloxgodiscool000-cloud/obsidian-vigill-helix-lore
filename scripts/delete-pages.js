#!/usr/bin/env node
/**
 * Deletes specific Wiki.js pages by ID. Defaults to a DRY RUN that only
 * shows what would be deleted -- nothing is actually deleted unless
 * CONFIRM_TEXT is exactly "DELETE".
 *
 * Required env vars:
 *   WIKIJS_URL   - e.g. https://wiki.example.com
 *   WIKIJS_TOKEN - API token with manage:pages / write:pages scope
 *   PAGE_IDS     - comma-separated list of page IDs, e.g. "12,13,45"
 *   CONFIRM_TEXT - must be exactly "DELETE" to actually delete; anything
 *                  else (including blank) runs as a dry run
 */

const WIKI_URL = process.env.WIKIJS_URL;
const TOKEN = process.env.WIKIJS_TOKEN;
const PAGE_IDS = process.env.PAGE_IDS || '';
const CONFIRM_TEXT = process.env.CONFIRM_TEXT || '';

if (!WIKI_URL || !TOKEN) {
  console.error('Error: WIKIJS_URL and WIKIJS_TOKEN environment variables are required.');
  process.exit(1);
}

const ids = PAGE_IDS.split(',').map((s) => s.trim()).filter(Boolean).map(Number);

if (!ids.length || ids.some((id) => Number.isNaN(id))) {
  console.error('Error: PAGE_IDS must be a comma-separated list of numeric IDs, e.g. "12,13,45".');
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
  console.log(`Requested ${ids.length} page ID(s) for deletion: ${ids.join(', ')}\n`);
  console.log('Looking up each page before doing anything...\n');

  const resolved = [];
  for (const id of ids) {
    try {
      const data = await gql(`query ($id: Int!) { pages { single(id: $id) { id path title } } }`, { id });
      const page = data?.pages?.single;
      if (page) {
        resolved.push(page);
        console.log(`  [${page.id}] /${page.path}  —  ${page.title}`);
      } else {
        console.log(`  [${id}] NOT FOUND (already deleted, or wrong ID?) — will be skipped`);
      }
    } catch (err) {
      console.log(`  [${id}] Error looking up page: ${err.message}`);
    }
  }

  if (CONFIRM_TEXT !== 'DELETE') {
    console.log(`\nDRY RUN — nothing was deleted.`);
    console.log(`Review the ${resolved.length} page(s) listed above. If that's exactly what you want gone,`);
    console.log(`re-run this workflow with confirm set to exactly: DELETE`);
    return;
  }

  console.log(`\nCONFIRM_TEXT was "DELETE" — proceeding with actual deletion.\n`);
  let failCount = 0;
  for (const page of resolved) {
    const data = await gql(`mutation ($id: Int!) { pages { delete(id: $id) { responseResult { succeeded errorCode message } } } }`, { id: page.id });
    const result = data.pages.delete.responseResult;
    if (result.succeeded) {
      console.log(`  Deleted [${page.id}] /${page.path}`);
    } else {
      console.error(`  Failed [${page.id}] /${page.path}: ${result.message}`);
      failCount++;
    }
  }

  if (failCount > 0) {
    console.error(`\n${failCount} deletion(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${resolved.length} page(s) deleted successfully.`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
