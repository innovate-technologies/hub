// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import config from "config";
import * as events from "app/events.js";
import fetch from "node-fetch";
import log from "app/logs.js";
import { parse as parseUrl, format as formatUrl } from "url";

const API_ENDPOINT = "https://api.github.com";
type MethodType = | "GET" | "POST" | "PATCH" | "DELETE";
const request = async (url: string, body: ?Object, method: ?MethodType): Promise<*> => {
  const res = await fetch(url, { method, body: JSON.stringify(body), headers: {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Innovate Hub (innovate-technologies/hub)",
    "Authorization": "Basic " + new Buffer(config.get("github.auth.username") + ":" +
                                           config.get("github.auth.token")).toString("base64"),
  } });
  if (!res.ok) {
    log.error({ status: res.status, body: await res.json() }, "res.ok = false");
    throw new Error("res.ok = false");
  }
  return res;
};
const getNextLink = (linkHeader: string): string => {
  for (const link of linkHeader.split(",")) {
    const [, target, ref] = /<([^>]+)>;\s*rel="([^"]+)"/.exec(link);
    if (ref === "next") {
      return target;
    }
  }
  return "";
};
const requestGetAll = async (url: string, body: ?Object) => { // flow-disable-line
  const p = parseUrl(url, true);
  p.query.per_page = 100; // eslint-disable-line camelcase
  let result = []; // flow-disable-line
  let res = await request(formatUrl(p), body);
  result = result.concat(await res.json());
  while (res.headers.get("link") && res.headers.get("link").includes("next")) {
    res = await request(getNextLink(res.headers.get("link")), body);
    result = result.concat(await res.json());
  }
  return result;
};


// This is (sort of) based on the implementation in Dolphin Central.
const TRUSTED_USERS_GROUP: string = config.get("github.trustedUsers.group");
const trustedUsers: Set<string> = new Set();

const syncUsers = async (set: Set<string>, group: string) => {
  const [org, team] = group.split("/");

  const teams: Array<Object> = await requestGetAll(API_ENDPOINT + `/orgs/${org}/teams`);
  const teamId = (teams.find(t => t.slug === team) || {}).id;
  if (!teamId) {
    log.error("Unable to find team " + group);
    return;
  }
  const users: Array<Object> = await requestGetAll(API_ENDPOINT + `/teams/${teamId}/members`);
  set.clear();
  users.forEach(user => set.add(user.login));

  events.dispatch("internal", new events.InternalEvent("Synced trusted users", trustedUsers));
};

syncUsers(trustedUsers, TRUSTED_USERS_GROUP);


// Events that will be hooked.
const WEBHOOK_REPO_EVENTS = [
  "push",
  "pull_request",
  "pull_request_review_comment",
  "commit_comment",
  "issues",
  "issue_comment",
];
const WEBHOOK_ORG_EVENTS = [
  "membership",
];

const HOOK_URL = config.get("publicUrl") + "/github";
const HOOK_SECRET: string = config.get("github.hookSecret");
type HookType = | "repos" | "orgs";
const installHook = async (what: HookType, name: string, activeEvents: Array<string>) => {
  log.info(`Checking if our webhook for ${name} (${what}) is present`);
  const hooks: Array<Object> = await requestGetAll(API_ENDPOINT + `/${what}/${name}/hooks`);
  const currentHook = hooks.find((hook) => hook.config && hook.config.url === HOOK_URL);
  let url: string = API_ENDPOINT + `/${what}/${name}/hooks`;
  let method: MethodType;
  if (currentHook) {
    log.info(`Hook for ${name} (${what}) is present`);
    url = currentHook.url;
    method = "PATCH";
  } else {
    log.info(`Hook for ${name} (${what}) is not present, installing`);
    method = "POST";
  }

  const data = {
    name: "web",
    config: {
      url: HOOK_URL,
      "content_type": "json",
      secret: HOOK_SECRET,
    },
    events: activeEvents,
    active: true,
  };
  await request(url, data, method);
};

const installHookForOrg = async () => {
  const org: string = config.get("github.organisation");
  try {
    await installHook("orgs", org, WEBHOOK_ORG_EVENTS);
  } catch (error) {
    log.error(error, "Failed to install hook for organisation.");
  }
  setTimeout(installHookForOrg, 1000 * 600);
};
const installHookForRepos = async () => {
  const repos: Array<string> = config.get("github.notify");
  try {
    await Promise.all(repos.map((repo) => installHook("repos", repo, WEBHOOK_REPO_EVENTS)));
  } catch (error) {
    log.error(error, "Failed to install hook for repos.");
  }
  setTimeout(installHookForRepos, 1000 * 600);
};

// Make sure our hooks are installed (every 10 minutes)
installHookForOrg();
installHookForRepos();


type Author = { name: string, email: string };
class GHCommit {
  id: string; url: string; author: Author; message: string;
  distinct: bool; added: Array<string>; modified: Array<string>; removed: Array<string>;

  constructor(id: string, url: string, author: Author, message: string,
              added: Array<string>, modified: Array<string>, removed: Array<string>) {
    Object.assign(this, { id, url, author, message, added, modified, removed });
  }
}

class GHIssue {
  repo: string; id: number; author: string; title: string; body: string; url: string;
  isFromTrustedAuthor: bool;

  constructor(repo: string, issue: Object) {
    Object.assign(this, {
      repo,
      id: issue.number,
      author: issue.user.login,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
    });
    this.isFromTrustedAuthor = trustedUsers.has(this.author);
  }
}

class GHPullRequest extends GHIssue {
  baseRefName: string; headRefName: string; baseSha: string; headSha: string;

  constructor(repo: string, pr: Object) {
    super(repo, pr);
    Object.assign(this, {
      baseRefName: pr.base.ref, headRefName: pr.head.ref,
      baseSha: pr.base.sha, headSha: pr.head.sha,
    });
  }
}

export class GHRawHookEvent extends events.Event {
  event: string; data: Object;

  constructor(event: string, data: Object) {
    super();
    Object.assign(this, { event, data });
  }
}

type MembershipActionType = | "added" | "removed";
export class GHMembershipEvent extends events.Event {
  action: MembershipActionType; member: Object; team: Object;

  constructor(action: MembershipActionType, member: Object, team: Object) {
    super();
    Object.assign(this, { action, member, team });
  }
}

export class GHPushEvent extends events.Event {
  repo: string; pusher: string; commits: Array<GHCommit>;
  beforeSha: string; afterSha: string; baseRefName: ?string; refType: string; refName: string;
  created: bool; deleted: bool; forced: bool;

  constructor(repo: string, pusher: string, commits: Array<GHCommit>,
              beforeSha: string, afterSha: string, baseRefName: ?string, ref: string,
              created: bool, deleted: bool, forced: bool) {
    super();
    const [, refType, refName] = ref.split("/");
    Object.assign(this, { repo, pusher, commits, beforeSha, afterSha, baseRefName, refType, refName,
                          created, deleted, forced });
  }
}

export class GHPullRequestEvent extends events.Event {
  pr: GHPullRequest; action: string; who: string;

  constructor(pr: GHPullRequest, action: string, who: string) {
    super();
    Object.assign(this, { pr, action, who });
  }
}

export class GHPullRequestReviewCommentEvent extends events.Event {
  pr: GHPullRequest; commenter: string; commitId: string; body: string;
  action: string; who: string; url: string;

  constructor(pr: GHPullRequest, commenter: string, commitId: string, body: string,
              action: string, who: string, url: string) {
    super();
    Object.assign(this, { pr, commenter, commitId, body, action, who, url });
  }
}

export class GHCommitCommentEvent extends events.Event {
  repo: string; commenter: string; commitId: string; body: string;
  action: string; who: string; url: string;

  constructor(repo: string, commenter: string, commitId: string, body: string,
              action: string, who: string, url: string) {
    super();
    Object.assign(this, { repo, commenter, commitId, body, action, who, url });
  }
}

export class GHIssueEvent extends events.Event {
  issue: GHIssue; action: string; who: string;

  constructor(issue: GHIssue, action: string, who: string) {
    super();
    Object.assign(this, { issue, action, who });
  }
}

export class GHIssueCommentEvent extends events.Event {
  issue: GHIssue; author: string; body: string; action: string; who: string; url: string;
  isFromTrustedAuthor: bool;

  constructor(issue: GHIssue, author: string, body: string, action: string, who: string, url: string) {
    super();
    Object.assign(this, { issue, author, body, action, who, url });
    this.isFromTrustedAuthor = trustedUsers.has(this.author);
  }
}

events.listen(GHRawHookEvent.name, function rawEventConverter(evt: GHRawHookEvent) {
  const SOURCE = "gh-evt-cvt";
  const data: Object = evt.data;
  switch (evt.event) {
    // Note: this is a org hook (unlike the others).
    case "membership":
      events.dispatch(SOURCE, new GHMembershipEvent(data.action, data.member, data.team));
      break;

    case "push":
      events.dispatch(SOURCE, new GHPushEvent(data.repository.full_name, data.pusher.name,
                                              data.commits, data.before, data.after,
                                              (data.base_ref || "").split("/")[2], data.ref,
                                              data.created, data.deleted, data.forced));
      break;

    case "pull_request":
      events.dispatch(SOURCE, new GHPullRequestEvent(
        new GHPullRequest(data.repository.full_name, data.pull_request), data.action, data.sender.login
      ));
      break;

    case "pull_request_review_comment":
      events.dispatch(SOURCE, new GHPullRequestReviewCommentEvent(
        new GHPullRequest(data.repository.full_name, data.pull_request),
        data.comment.user.login, data.comment.commit_id, data.body,
        data.action, data.sender.login, data.commit.html_url
      ));
      break;

    case "commit_comment":
      events.dispatch(SOURCE, new GHCommitCommentEvent(
        data.repository.full_name, data.comment.user.login, data.comment.commit_id,
        data.comment.body, data.action, data.sender.login, data.comment.html_url
      ));
      break;

    case "issues":
      events.dispatch(SOURCE, new GHIssueEvent(
        new GHIssue(data.repository.full_name, data.issue), data.action, data.sender.login
      ));
      break;

    case "issue_comment":
      events.dispatch(SOURCE, new GHIssueCommentEvent(
        new GHIssue(data.repository.full_name, data.issue),
        data.comment.user.login, data.comment.body,
        data.action, data.sender.login, data.comment.html_url
      ));
      break;

    case "ping":
      events.dispatch(SOURCE, new events.InternalEvent("Received hook ping from GitHub"));
      break;

    default: {
      const message = "Received unexpected event: " + evt.event;
      events.dispatch(SOURCE, new events.InternalEvent(message));
      log.warn({ component: "gh-evt-cvt", evt }, message);
    }
  }
});

const slugToSetMap: { [slug: string]: Set<string> } = {};
slugToSetMap[TRUSTED_USERS_GROUP] = trustedUsers;
events.listen(GHMembershipEvent.name, (evt: GHMembershipEvent) => {
  const set: Set<string> = slugToSetMap[evt.team.slug];
  if (!set) {
    return;
  }
  if (evt.action === "added") {
    set.add(evt.member.login);
  } else if (evt.action === "removed") {
    set.delete(evt.member.login);
  } else {
    log.error(evt, "GHMembershipEvent: Unexpected action");
  }
});
