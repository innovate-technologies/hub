// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import config from "config";
import { CLIENT_EVENTS, RTM_EVENTS, MemoryDataStore, RtmClient, WebClient } from "@slack/client";

import * as events from "app/events.js";
import log from "app/logs.js";
import * as whmcs from "app/whmcs.js";

export class SlackMessageEvent extends events.Event {
  from: string; channel: string; message: string; isDirect: bool;

  constructor(from: string, channel: string, message: string, isDirect: bool) {
    super();
    Object.assign(this, { from, channel, message, isDirect });
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
  if (!direct && !CHANNEL_NAMES.includes(channelName)) {
    return;
  }
  events.dispatch("slack-rtm-" + message.team,
                  new SlackMessageEvent(username, channelName, message.text, direct));
});

rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, () => {
  log.info("Connected to Slack.");
});

rtm.start();

const SUPPORT_CHANNEL = config.get("slack.notify.support");
events.listen(whmcs.WHMCSTicketOpenEvent.name, async (event: whmcs.WHMCSTicketOpenEvent) => {
  const message: string = `[whmcs-support] _${event.who}_ opened <${event.ticket.link}\
|ticket #${event.ticket.id} (${event.ticket.title})> for client _${event.ticket.clientName}_`;
  try {
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
  } catch (error) {
    log.error(error, "Failed to send Slack message.");
  }
});

events.listen(whmcs.WHMCSTicketFlagEvent.name, async (event: whmcs.WHMCSTicketFlagEvent) => {
  const message: string = (event.who === event.flaggedTo)
      ? `[whmcs-support] _${event.who}_ flagged <${event.ticket.link}|ticket #${event.ticket.id} ` +
        `(${event.ticket.title})> to themselves`
      : `[whmcs-support] _${event.who}_ flagged <${event.ticket.link}|ticket #${event.ticket.id} ` +
        `(${event.ticket.title})> to _${event.flaggedTo}_`;

  try {
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
  } catch (error) {
    log.error(error, "Failed to send Slack message.");
  }
});

const IGNORED_STATUSES = ["Answered"];
events.listen(whmcs.WHMCSTicketStatusChangeEvent.name, async (event: whmcs.WHMCSTicketStatusChangeEvent) => {
  if (IGNORED_STATUSES.includes(event.newStatus)) {
    return;
  }
  const message: string = `[whmcs-support] _${event.who}_ changed status for <${event.ticket.link}` +
      `|ticket #${event.ticket.id} (${event.ticket.title})> to ${event.newStatus}`;
  try {
    await web.chat.postMessage(SUPPORT_CHANNEL, message, { "as_user": true });
  } catch (error) {
    log.error(error, "Failed to send Slack message.");
  }
});

{
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
    let message: string = `[whmcs-support] _${event.who}_ ${action} <${event.ticket.link}` +
                          `|ticket #${event.ticket.id} (${event.ticket.title})>`;
    if (event.type === "ReplyFromStaff") {
      message += ` from client ${event.ticket.clientName}`;
    }
    try {
      await web.chat.postMessage(SUPPORT_CHANNEL, message, {
        attachments: [
          {
            "author_name": event.who,
            color: eventTypeColourMap[event.type],
            fallback: event.ticket.link,
            text: event.message,
          },
        ],
        "as_user": true,
      });
    } catch (error) {
      log.error(error, "Failed to send Slack message.");
    }
  });
}
