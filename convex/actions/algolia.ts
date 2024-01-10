// Index discord into algolia
"use node";
import { api } from "../_generated/api";
import algoliasearch from "algoliasearch";
import { internalAction } from "../_generated/server";

export const ALGOLIA_APP_ID = "1KIE511890";
export function getAlgolia() {
  return algoliasearch(ALGOLIA_APP_ID, process.env.ALGOLIA_API_KEY!);
}
const DISCORD_INDEX = "discord";

export const index = internalAction(async ({ runQuery, runMutation }) => {
  const algolia = getAlgolia();
  const index = algolia.initIndex(DISCORD_INDEX);
  while (true) {
    const { documents, position } = await runQuery(
      api.indexing.updatedSearchDocuments,
      {}
    );
    if (position == null) {
      break;
    }
    for (const doc of documents) {
      console.log(`(Re-)indexing thread ${doc.objectID}`);
      await index.saveObject(doc);
    }
    await runMutation(api.indexing.setSearchIndex, { position });
  }
});
