// Copyright (c) 2017 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import * as events from "app/events.js";
import log from "app/logs.js";

export class CentowatchRawHookEvent extends events.Event {
  event: string; data: Object; ip: string;

  constructor(event: string, data: Object, ip: string) {
    super();
    this.event = event;
    this.data = data;
    this.ip = ip;
  }
}

export class CentowatchLogEvent extends events.Event {
  message: string; ip: string;

  constructor(message: string, ip: string) {
    super();
    this.message = message;
    this.ip = ip;
  }
}

export class CentowatchErrorEvent extends events.Event {
  message: string; error: string; ip: string;

  constructor(message: string, error: string, ip: string) {
    super();
    this.message = message;
    this.error = error;
    this.ip = ip;
  }
}

events.listen(CentowatchRawHookEvent.name, (evt: CentowatchRawHookEvent) => {
  switch (evt.event) {
    case "log":
      events.dispatch("centowatch", new CentowatchLogEvent(evt.data.message, evt.ip));
      break;
    case "error":
      events.dispatch("centowatch", new CentowatchErrorEvent(evt.data.message, evt.data.error, evt.ip));
      break;
    default: {
      const message = "Received unexpected event: " + evt.event;
      events.dispatch("centowatch", new events.InternalEvent(message));
      log.warn({ component: "centowatch-evt-cvt", evt }, message);
      break;
    }
  }
});
