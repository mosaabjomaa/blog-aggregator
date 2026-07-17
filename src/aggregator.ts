import { createPost } from "./lib/db/queries/posts.js";
import { fetchFeed } from "./rss.js";
import {
  getNextFeedToFetch,
  markFeedFetched,
} from "./lib/db/queries/feeds.js";


export async function scrapeFeeds() {

  const feed = await getNextFeedToFetch();

  if (!feed) {
    throw new Error("no feeds found");
  }


  console.log(`Fetching ${feed.name}`);


  const rssFeed = await fetchFeed(feed.url);


  await markFeedFetched(feed.id);


for (const item of rssFeed.channel.item) {

  await createPost(
    item.title,
    item.link,
    item.description ?? null,
    new Date(item.pubDate),
    feed.id
  );

  console.log(
    `Saved post: ${item.title}`
  );
}
}
