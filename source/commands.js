// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import config from "config";

import * as events from "app/events.js";
import log from "app/logs.js";
import { SlackMessageEvent } from "app/slack.js";

const TRUSTED_PEOPLE: Array<string> = config.get("slack.trustedPeople");

events.listen(SlackMessageEvent.name, (event: SlackMessageEvent) => {
  if (!event.isDirect || !TRUSTED_PEOPLE.includes(event.from)) {
    return;
  }

  if (event.message.endsWith("restart")) {
    log.info(event, "Restarting (as requested)");
    process.exit(0);
  }
});
