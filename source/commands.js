// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import * as events from "app/events.js";
import log from "app/logs.js";
import { SlackMessageEvent, sendMessage } from "app/slack.js";
import { exec } from "app/utils.js";

events.listen(SlackMessageEvent.name, async (event: SlackMessageEvent) => {
  if (!event.isDirect) {
    return;
  }

  if (event.trusted && event.message.endsWith("update")) {
    log.info("Running git pull --rebase");
    try {
      const output = await exec("git", ["pull", "--rebase"]);
      await sendMessage(event.channel, "Done, here is the output of git pull:\n" + output);
    } catch (error) {
      log.error(error);
      await sendMessage(event.channel, "I couldn't do that.");
    }
    return;
  }

  if (event.trusted && event.message.endsWith("restart")) {
    await sendMessage(event.channel, "See ya all later byeeeee");
    log.info(event, "Restarting (as requested)");
    process.exit(0);
    return;
  }

  if (event.trusted && event.message.endsWith("update ITFrame")) {
    await sendMessage(event.channel, "Starting update");
    
    try {
      await sendMessage(event.channel, "Updating the London cluster");
      const outputLdn = await exec("ssh", ["innobot@itframe-swarm.innovatete.ch", "'docker service update --image innovate/itframe:latest --detach=false itframe-ldn'"]);
      await sendMessage(event.channel, "Done, here is the output of:\n" + outputLdn);

      await sendMessage(event.channel, "Updating the Frankfurt cluster");
      const outputFra = await exec("ssh", ["innobot@itframe-swarm.innovatete.ch", "'docker service update --image innovate/itframe:latest --detach=false itframe-fra'"]);
      await sendMessage(event.channel, "Done, here is the output of:\n" + outputFra);
    } catch (error) {
      log.error(error);
      await sendMessage(event.channel, "I couldn't do that.");
    }
    
    return;
  }
});
