// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import config from "config";

import * as events from "app/events.js";
import log from "app/logs.js";
import { SlackMessageEvent, sendMessage } from "app/slack.js";

const TRUSTED_PEOPLE: Array<string> = config.get("slack.trustedPeople");

events.listen(SlackMessageEvent.name, async (event: SlackMessageEvent) => {
  if (!event.isDirect) {
    return;
  }

  const trusted: bool = TRUSTED_PEOPLE.includes(event.from);

  if (trusted && event.message.endsWith("restart")) {
    await sendMessage(event.channel, "See ya all later byeeeee");
    log.info(event, "Restarting (as requested)");
    process.exit(0);
    return;
  }

  sendMessage(event.channel, "Hi!");
});
