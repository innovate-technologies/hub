// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import config from "config";
import { Html5Entities as Entities } from "html-entities";
import { CLIENT_EVENTS, RTM_EVENTS, MemoryDataStore, RtmClient, WebClient } from "@slack/client";

import * as events from "app/events.js";
import * as github from "app/github.js";
import log from "app/logs.js";
import util from "util";
import * as whmcs from "app/whmcs.js";

const entities = new Entities();

export class SlackMessageEvent extends events.Event {
  from: string; channel: string; message: string; isDirect: bool;

  constructor(from: string, channel: string, message: string, isDirect: bool) {
    super();
    Object.assign(this, { from, channel, message, isDirect });
    this.message = entities.decode(this.message);
  }
}

const TOKEN: string = config.get("slack.token");
const CHANNEL_NAMES: Array<string> = config.get("slack.channelNames");

const web = new WebClient(TOKEN);

// Real-time client
const rtm = new RtmClient(TOKEN, { dataStore: new MemoryDataStore(), logLevel: "error" });

type MessageType = {
  type: string, subtype: string, hidden: bool,
  channel: string, user: string, text: string, ts: string, team: string,
};

rtm.on(RTM_EVENTS.MESSAGE, (message: MessageType) => {
  // We only want to process real messages, not message edits, file uploads, etc.
  if (message.type !== "message" || message.subtype || message.hidden) {
    return;
  }

  const direct: bool = message.text.includes(`<@${rtm.activeUserId}>`);
  const username: string = rtm.dataStore.getUserById(message.user).name;
  const channelName: string = rtm.dataStore.getChannelGroupOrDMById(message.channel).name;
  if (!CHANNEL_NAMES.includes(channelName)) {
    return;
  }
  events.dispatch("slack-rtm-" + message.team,
                  new SlackMessageEvent(username, channelName, message.text, direct));
});

rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, () => {
  log.info("Connected to Slack.");
});

rtm.start();

export const sendMessage = (channel: string, message: string) => {
  return web.chat.postMessage(channel, message, { "as_user": true });
};

const formatName = (name: string): string => {
  return "_" + name.charAt(0) + "\u2060" + name.slice(1) + "_";
};

// WHMCS support notifications

const SUPPORT_CHANNEL = config.get("slack.notify.support");
events.listen(whmcs.WHMCSTicketOpenEvent.name, async (event: whmcs.WHMCSTicketOpenEvent) => {
  const message: string = `[whmcs-support] ${formatName(event.who)} opened <${event.ticket.link}\
|ticket #${event.ticket.id} (${event.ticket.title})> for client _${event.ticket.clientName}_`;
  await web.chat.postMessage(SUPPORT_CHANNEL, message, {
    attachments: [
      {
        "author_name": event.who,
        color: "#FFC107",
        fallback: event.ticket.link,
        text: event.ticket.message,
        title: `#${event.ticket.id} - ${event.ticket.title}`,
        "title_link": event.ticket.link,
      },
    ],
    "as_user": true,
  });
});

events.listen(whmcs.WHMCSTicketFlagEvent.name, async (event: whmcs.WHMCSTicketFlagEvent) => {
  const message: string = (event.who === event.flaggedTo)
      ? `[whmcs-support] ${formatName(event.who)} flagged <${event.ticket.link}|ticket #${event.ticket.id} ` +
        `(${event.ticket.title})> to themselves`
      : `[whmcs-support] ${formatName(event.who)} flagged <${event.ticket.link}|ticket #${event.ticket.id} ` +
        `(${event.ticket.title})> to _${event.flaggedTo}_`;

  await web.chat.postMessage(SUPPORT_CHANNEL, message, { "as_user": true });
  if (event.who !== event.flaggedTo) {
    await web.chat.postMessage("@" + event.flaggedTo.toLowerCase(), message, {
      attachments: [
        {
          "author_name": event.ticket.clientName,
          color: "#3F51B5",
          fallback: event.ticket.link,
          title: `#${event.ticket.id} - ${event.ticket.title}`,
          "title_link": event.ticket.link,
        },
      ],
      "as_user": true,
    });
  }
});

const IGNORED_STATUSES = ["Answered"];
events.listen(whmcs.WHMCSTicketStatusChangeEvent.name, async (event: whmcs.WHMCSTicketStatusChangeEvent) => {
  if (IGNORED_STATUSES.includes(event.newStatus)) {
    return;
  }
  const message: string = `[whmcs-support] ${formatName(event.who)} changed status for <${event.ticket.link}` +
      `|ticket #${event.ticket.id} (${event.ticket.title})> to ${event.newStatus}`;
  await web.chat.postMessage(SUPPORT_CHANNEL, message, { "as_user": true });
});

{
  const filterOutSignature = (message: string): string => {
    return message.split("Kindest Regards")[0];
  };

  const eventTypeActionMap: { [eventType: whmcs.WHMCSTicketObjectType]: string } = {
    "ReplyFromClient": "replied to",
    "ReplyFromStaff": "replied to",
    "Note": "added a note to",
  };
  const eventTypeColourMap: { [eventType: whmcs.WHMCSTicketObjectType]: string } = {
    "ReplyFromClient": "#FF9800",
    "ReplyFromStaff": "#4CAF50",
    "Note": "#2196F3",
  };

  events.listen(whmcs.WHMCSTicketObjectEvent.name, async (event: whmcs.WHMCSTicketObjectEvent) => {
    const action: string = eventTypeActionMap[event.type];
    let message: string = `[whmcs-support] ${formatName(event.who)} ${action} <${event.ticket.link}` +
                          `|ticket #${event.ticket.id} (${event.ticket.title})>`;
    if (event.type === "ReplyFromStaff") {
      message += ` from client _${event.ticket.clientName}_`;
    }
    await web.chat.postMessage(SUPPORT_CHANNEL, message, {
      attachments: [
        {
          "author_name": event.who,
          color: eventTypeColourMap[event.type],
          fallback: event.ticket.link,
          text: filterOutSignature(event.message),
        },
      ],
      "as_user": true,
    });
  });
}

// GitHub notifications

const DEV_CHANNEL = config.get("slack.notify.dev");
const getRepoLink = (repo: string) => "https://github.com/" + repo;
const formatHash = (hash: string) => "`" + hash.substring(0, 7) + "`";
events.listen(github.GHPushEvent.name, async (evt: github.GHPushEvent) => {
  const repoLink = getRepoLink(evt.repo);
  const commits = evt.commits.filter((commit) => commit.distinct);

  let message = `[<${repoLink}|${evt.repo}>] ${formatName(evt.pusher)}`;
  if (evt.created) {
    if (evt.refType === "tags") {
      message += ` tagged ${evt.baseRefName || formatHash(evt.afterSha)} as ${evt.refName}`;
    } else {
      message += ` pushed new branch ${evt.refName}`;
    }
  } else if (evt.deleted) {
    message += ` deleted ${evt.refName} (was at ${formatHash(evt.beforeSha)})`;
  } else if (evt.forced) {
    message += ` force-pushed ${evt.refName} from ${formatHash(evt.beforeSha)} to ${formatHash(evt.afterSha)}`;
  } else if (evt.commits.length && !commits.length) {
    if (evt.baseRefName) {
      message += ` merged ${evt.baseRefName} into ${evt.refName}`;
    } else {
      message += ` fast-forwarded ${evt.refName} from ${formatHash(evt.beforeSha)} to ${formatHash(evt.afterSha)}`;
    }
  } else {
    message += ` pushed ${commits.length} commit${commits.length === 1 ? "" : "s"} to ${evt.refName}`;
  }

  let attachmentText: string = "";
  for (const commit of commits) {
    attachmentText += util.format("`<%s|%s>` by %s [%d|%d|%d] %s\n",
                                  commit.url, commit.id.substring(0, 7), commit.author.name,
                                  commit.added.length, commit.modified.length, commit.removed.length,
                                  commit.message.split("\n")[0]);
  }

  await web.chat.postMessage(DEV_CHANNEL, message, {
    attachments: [{
      color: "#283593",
      fallback: attachmentText,
      text: attachmentText,
      "mrkdwn_in": ["text"],
    }],
    "as_user": true,
    "unfurl_links": false,
  });
});

events.listen(github.GHPullRequestEvent.name, async (evt: github.GHPullRequestEvent) => {
  const action = evt.action === "synchronize" ? "synchronised" : evt.action;
  const message = `[<${getRepoLink(evt.pr.repo)}|${evt.pr.repo}>] ${formatName(evt.pr.author)}`
    + ` ${action} pull request <${evt.pr.url}|#${evt.pr.id}: ${evt.pr.title}>`
    + ` (${evt.pr.baseRefName}..${evt.pr.headRefName}`;
  await web.chat.postMessage(DEV_CHANNEL, message, {
    attachments: [{
      color: "#1565C0",
      fallback: evt.pr.body,
      text: evt.pr.body,
      "mrkdwn_in": ["text"],
    }],
    "as_user": true,
    "unfurl_links": false,
  });
});

events.listen(github.GHPullRequestReviewCommentEvent.name,
  async (evt: github.GHPullRequestReviewCommentEvent) => {
    const action = evt.action === "created" ? "commented" : `${evt.action} comment`;
    const message = `[<${getRepoLink(evt.pr.repo)}|${evt.pr.repo}>] ${formatName(evt.commenter)}`
      + ` <${evt.url}|${action}> on pull request <${evt.pr.url}|#${evt.pr.id}> (${evt.pr.title})`
      + ` ${formatHash(evt.commitId)}`;
    await web.chat.postMessage(DEV_CHANNEL, message, {
      attachments: [{
        color: "#1565C0",
        fallback: evt.body,
        text: evt.body,
        "mrkdwn_in": ["text"],
      }],
      "as_user": true,
      "unfurl_links": false,
    });
  }
);

events.listen(github.GHCommitCommentEvent.name, async (evt: github.GHCommitCommentEvent) => {
  const action = evt.action === "created" ? "commented" : `${evt.action} comment`;
  const message = `[<${getRepoLink(evt.repo)}|${evt.repo}>] ${formatName(evt.commenter)}`
    + ` <${evt.url}|${action}> on commit <${evt.url}|${formatHash(evt.commitId)}>`;
  await web.chat.postMessage(DEV_CHANNEL, message, {
    attachments: [{
      color: "#039BE5",
      fallback: evt.body,
      text: evt.body,
      "mrkdwn_in": ["text"],
    }],
    "as_user": true,
    "unfurl_links": false,
  });
});

events.listen(github.GHIssueEvent.name, async (evt: github.GHIssueEvent) => {
  const message = `[<${getRepoLink(evt.issue.repo)}|${evt.issue.repo}>] ${formatName(evt.issue.author)}`
    + ` ${evt.action} issue <${evt.issue.url}|#${evt.issue.id}: ${evt.issue.title}>`;
  await web.chat.postMessage(DEV_CHANNEL, message, {
    attachments: [{
      color: "#FF5722",
      fallback: evt.issue.body,
      text: evt.issue.body,
      "mrkdwn_in": ["text"],
    }],
    "as_user": true,
    "unfurl_links": false,
  });
});

events.listen(github.GHIssueCommentEvent.name, async (evt: github.GHIssueCommentEvent) => {
  const action = evt.action === "created" ? "commented" : `${evt.action} comment`;
  const message = `[<${getRepoLink(evt.issue.repo)}|${evt.issue.repo}>] ${formatName(evt.author)}`
    + ` <${evt.url}|${action}> on <${evt.issue.url}|#${evt.issue.id}: ${evt.issue.title}>`;
  await web.chat.postMessage(DEV_CHANNEL, message, {
    attachments: [{
      color: "#1565C0",
      fallback: evt.body,
      text: evt.body,
      "mrkdwn_in": ["text"],
    }],
    "as_user": true,
    "unfurl_links": false,
  });
});
