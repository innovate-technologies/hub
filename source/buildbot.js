// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import fs from "fs";
import util from "util";

import config from "config";
import fetch from "node-fetch";
import uuid4 from "uuid/v4";

import { BuildEvent, ReleaseBuildEvent } from "app/build-events.js";
import type { BuildEventState } from "app/build-events.js";
import * as events from "app/events.js";
import * as github from "app/github.js";
import * as slack from "app/slack.js";
import * as utils from "app/utils.js";

export class BBRawHookEvent extends events.Event {
  data: Object;
  constructor(data: Object) {
    super();
    this.data = data;
  }
}


const SSH_DEST: string = config.get("buildbot.sshDest");
async function sendChange(author: string, repo: string, branch: string, revision: string,
                          description: string, url: string) {
  const args = [SSH_DEST, "./git-changes/send-buildbot-change", "--vc=git"];
  args.push(util.format("--who=%s", utils.escapeShell(author)));
  args.push(util.format("--revision=%s", utils.escapeShell(revision)));
  args.push(util.format("--property=description:%s", utils.escapeShell(description)));
  args.push(util.format("--revlink=%s", utils.escapeShell(url)));
  args.push(util.format("--comments=%s", utils.escapeShell(description.split("\n")[0])));
  args.push(util.format("--branch=%s", utils.escapeShell(branch)));
  args.push(util.format("--repository=%s", utils.escapeShell(repo)));
  await utils.exec("ssh", args);
}

async function sendPullRequestBuild(who: string, repo: string, pr: number, baseSha: string,
                                    headSha: string, description: string, patch: string) {
  const jobDir = config.get("buildbot.jobdir") + "/" + repo;

  const fileName: string = uuid4();
  const diffPath = "/tmp/" + fileName;
  fs.writeFileSync(diffPath, patch);
  await utils.exec("scp", [diffPath, SSH_DEST + ":" + diffPath]);

  const args = [SSH_DEST, config.get("buildbot.buildbotBin"), "try"];
  args.push(util.format("--jobdir=%s", jobDir));
  args.push(util.format("--who=%s", utils.escapeShell(who)));
  args.push(util.format("--comment=%s", utils.escapeShell(description)));
  args.push(util.format("--diff=%s", diffPath));
  args.push(util.format("--repository=%s", repo));
  args.push(util.format("--baserev=%s", baseSha));
  args.push(util.format("--property=head_rev=%s", headSha));
  args.push(util.format("--property=pr_number=%d", pr));
  args.push(util.format("--property=who=%s", utils.escapeShell(who)));
  // Dirty hack to avoid having to install buildbot on the Hub host.
  args.push("--connect=ssh");
  args.push("--host=localhost");
  args.push("--buildbotbin=" + config.get("buildbot.buildbotBin"));
  args.push("--patchlevel=1");

  await utils.exec("ssh", args);
}

async function buildPullRequest(who: string, trusted: bool, repo: string, prNumber: number) {
  const res = await github.request(`https://api.github.com/repos/${repo}/pulls/${prNumber}`);
  const pr: Object = await res.json();
  const baseSha: string = pr.base.sha;
  const headSha: string = pr.head.sha;

  if (!trusted) {
    events.dispatch("builder", new BuildEvent("", "hub", repo, headSha, prNumber, "failure",
                    "PR not built (non-trusted user)"));
    return;
  }

  if (pr.mergeable === false) {
    events.dispatch("builder", new BuildEvent("", "hub", repo, headSha, prNumber, "failure",
                    "PR not built (not mergeable)"));
    return;
  }

  try {
    const patch: string = await (await fetch(`https://github.com/${repo}/pull/${prNumber}.patch`)).text();
    await sendPullRequestBuild(`Hub (for ${who})`, repo, prNumber, baseSha, headSha,
                               `Auto build for PR ${prNumber}`, patch);
    events.dispatch("builder", new BuildEvent("", "hub", repo, headSha, prNumber, "success",
                    "Sent build requests to Buildbot"));
  } catch (error) {
    error.message = "Sending build request failed: " + error.message;
    throw error;
  }
}

const BUILDBOT_RESULTS_INT_MAP: [{state: BuildEventState, description: string}] = [
  { state: "success", description: "Build successful" }, // 0
  { state: "success", description: "Build successful (with warnings)" }, // 1
  { state: "failure", description: "Build failed" }, // 2
];
events.listen(BBRawHookEvent.name, (evt: BBRawHookEvent) => {
  if (!evt.data.properties.repository) {
    return;
  }

  let state: BuildEventState = "pending";
  let description: string = "Unknown";
  if (evt.data.complete) {
    ({ state, description } = BUILDBOT_RESULTS_INT_MAP[evt.data.results]);
  } else {
    state = "pending";
    description = "Build started";
  }

  // Not a PR build
  if (!evt.data.properties.pr_number && evt.data.properties.branch[0] === "master") {
    events.dispatch("buildbot", new ReleaseBuildEvent(
      evt.data.url, evt.data.builder.name,
      evt.data.properties.repository[0],
      evt.data.properties.revision[0],
      state
    ));
    return;
  }

  events.dispatch("buildbot", new BuildEvent(evt.data.url, evt.data.builder.name,
                                             evt.data.properties.repository[0],
                                             evt.data.properties.head_rev[0],
                                             parseInt(evt.data.properties.pr_number[0], 10),
                                             state, description));
});

// Rebuild trigger (via Slack)
events.listen(slack.SlackMessageEvent.name, async (evt: slack.SlackMessageEvent) => {
  const REBUILD_REGEX = /\brebuild ([a-zA-Z]+):(?:pr ?)?(\d+)\b/i;

  if (!evt.trusted) {
    return;
  }

  const matches: Array<string> = REBUILD_REGEX.exec(evt.message);
  if (!matches) {
    return;
  }
  const repoName: string = matches[1];
  const prNumber: number = parseInt(matches[2], 10);
  if (!repoName || !prNumber) {
    await slack.sendMessage(evt.channel, "I couldn't figure out the repo name or PR#…");
    return;
  }

  events.dispatch("internal", new events.InternalEvent("Rebuilding " + repoName + " PR " + prNumber
                                                       + " (via Slack)"));
  try {
    await slack.sendMessage(evt.channel, ":gear: :gear: :gear:");
    await buildPullRequest(evt.from, true, "innovate-technologies/" + repoName, prNumber);
  } catch (error) {
    await slack.sendMessage(evt.channel, ":warning: I couldn't do that: " + error.message);
  }
});

// GitHub triggers
events.listen(github.GHPullRequestEvent.name, async (evt: github.GHPullRequestEvent) => {
  if (evt.action !== "synchronize" && evt.action !== "opened") {
    return;
  }
  events.dispatch("internal", new events.InternalEvent("Rebuilding " + evt.pr.repo +
                                                       " PR " + evt.pr.id + " (via push)"));
  await buildPullRequest(evt.who, evt.pr.isFromTrustedAuthor, evt.pr.repo, evt.pr.id);
});

events.listen(github.GHPushEvent.name, async (evt: github.GHPushEvent) => {
  for (let commit of evt.commits) {
    events.dispatch("internal", new events.InternalEvent("Sending change " + commit.id + " to Buildbot"));
    await sendChange(commit.author.name, evt.repo, evt.refName, commit.id, commit.message, commit.url);
  }
});
