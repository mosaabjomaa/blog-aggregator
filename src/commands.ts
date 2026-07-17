import { getPostsForUser } from "./lib/db/queries/posts.js";
import { scrapeFeeds } from "./aggregator.js";
import { setUser, readConfig } from "./config.js";
import {
  createUser,
  getUserByName,
  deleteAllUsers,
  getUsers,
} from "./lib/db/queries/users.js";
import { fetchFeed } from "./rss.js";
import { Feed, User } from "./lib/db/schema.js";
import {
  createFeed,
  getFeeds,
  getFeedByURL,
} from "./lib/db/queries/feeds.js";
import {
  createFeedFollow,
  getFeedFollowsForUser,
  deleteFeedFollow,
} from "./lib/db/queries/feed_follows.js";

export async function handlerBrowse(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {

  let limit = 2;

  if (args.length > 0) {
    limit = Number(args[0]);
  }


  const posts = await getPostsForUser(
    user.id,
    limit
  );


  for (const post of posts) {

    console.log(`* ${post.title}`);
    console.log(`  ${post.url}`);
    console.log("");
  }
}

export type CommandHandler = (
  cmdName: string,
  ...args: string[]
) => Promise<void>;

export type CommandsRegistry = {
  [key: string]: CommandHandler;
};

export type UserCommandHandler = (
  cmdName: string,
  user: User,
  ...args: string[]
) => Promise<void>;


export function middlewareLoggedIn(
  handler: UserCommandHandler
): CommandHandler {

  return async (
    cmdName: string,
    ...args: string[]
  ) => {

    const config = readConfig();

    if (!config.currentUserName) {
      throw new Error("no user logged in");
    }

    const user = await getUserByName(
      config.currentUserName
    );

    if (!user) {
      throw new Error("user not found");
    }

    await handler(
      cmdName,
      user,
      ...args
    );
  };
}

export function printFeed(feed: Feed, user: User) {
  console.log("Feed:");
  console.log("  ID:", feed.id);
  console.log("  Name:", feed.name);
  console.log("  URL:", feed.url);
  console.log("  User:", user.name);
}

export async function handlerLogin(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("username is required");
  }

  const username = args[0];

  const user = await getUserByName(username);

  if (!user) {
    throw new Error("user does not exist");
  }

  setUser(username);

  console.log(`User has been set to ${username}`);
}

export async function handlerRegister(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("name is required");
  }

  const name = args[0];

  const existingUser = await getUserByName(name);

  if (existingUser) {
    throw new Error("user already exists");
  }

  const user = await createUser(name);

  setUser(name);

  console.log("User created successfully");
  console.log(user);
}

export async function handlerReset(
  cmdName: string
): Promise<void> {
  await deleteAllUsers();
  console.log("Database reset successfully");
}

export async function handlerUsers(
  cmdName: string
): Promise<void> {
  const users = await getUsers();
  const config = readConfig();

  for (const user of users) {
    if (user.name === config.currentUserName) {
      console.log(`* ${user.name} (current)`);
    } else {
      console.log(`* ${user.name}`);
    }
  }
}

export async function handlerAgg(
  cmdName: string,
  ...args: string[]
): Promise<void> {

  if (args.length < 1) {
    throw new Error("time duration required");
  }

  const timeBetweenRequests = parseDuration(args[0]);

  console.log(
    `Collecting feeds every ${args[0]}`
  );

  await scrapeFeeds();

  const interval = setInterval(() => {
    scrapeFeeds().catch(console.error);
  }, timeBetweenRequests);


  await new Promise<void>((resolve) => {

    process.on("SIGINT", () => {

      console.log(
        "Shutting down feed aggregator..."
      );

      clearInterval(interval);

      resolve();
    });

  });
}
export async function handlerAddFeed(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 2) {
    throw new Error("name and url are required");
  }

  const name = args[0];
  const url = args[1];


  const feed = await createFeed(name, url, user.id);

  await createFeedFollow(user.id, feed.id);

  printFeed(feed, user);

  console.log(`User ${user.name} followed ${feed.name}`);
}

export async function handlerFeeds(
  cmdName: string
): Promise<void> {
  const feeds = await getFeeds();

  for (const feed of feeds) {
    console.log(`* ${feed.name}`);
    console.log(`  URL: ${feed.url}`);
    console.log(`  User: ${feed.userName}`);
  }
}

export async function handlerFollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 1) {
    throw new Error("feed url required");
  }

  const url = args[0];


  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error("feed not found");
  }

  const follow = await createFeedFollow(user.id, feed.id);

  console.log(`User ${follow.userName} followed ${follow.feedName}`);
}

export async function handlerUnfollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {

  if (args.length < 1) {
    throw new Error("feed url required");
  }

  const url = args[0];

  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error("feed not found");
  }

  await deleteFeedFollow(
    user.id,
    feed.id
  );

  console.log(
    `User ${user.name} unfollowed ${feed.name}`
  );
}

export async function handlerFollowing(
  cmdName: string,
  user: User
): Promise<void> {

  const follows = await getFeedFollowsForUser(user.id);

  for (const follow of follows) {
    console.log(`* ${follow.feedName}`);
  }
}

export function registerCommand(
  registry: CommandsRegistry,
  cmdName: string,
  handler: CommandHandler
): void {
  registry[cmdName] = handler;
}

export async function runCommand(
  registry: CommandsRegistry,
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const handler = registry[cmdName];

  if (!handler) {
    throw new Error(`unknown command: ${cmdName}`);
  }

  await handler(cmdName, ...args);
}
export function parseDuration(durationStr: string): number {

  const regex = /^(\d+)(ms|s|m|h)$/;

  const match = durationStr.match(regex);

  if (!match) {
    throw new Error("invalid duration");
  }

  const amount = Number(match[1]);
  const unit = match[2];


  switch(unit) {
    case "ms":
      return amount;

    case "s":
      return amount * 1000;

    case "m":
      return amount * 60 * 1000;

    case "h":
      return amount * 60 * 60 * 1000;

    default:
      throw new Error("invalid duration");
  }
}
