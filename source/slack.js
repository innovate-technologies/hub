// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import config from "config";
import { CLIENT_EVENTS, RTM_EVENTS, MemoryDataStore, RtmClient } from "@slack/client";

import * as events from "app/events.js";
import log from "app/logs.js";

const TOKEN: string = config.get("slack.token");
const CHANNEL_NAMES: Array<string> = config.get("slack.channelNames");

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
                  new events.SlackMessageEvent(username, channelName, message.text, direct));
});

rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, () => {
  log.info("Connected to Slack.");
});

rtm.start();
