// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import { EventEmitter } from "events";

import log from "app/logs.js";

const eventEmitter = new EventEmitter();

export class Event {
  date: Date; source: string;

  constructor() {
    this.date = new Date();
  }
}

export class InternalEvent extends Event {
  message: string; data: ?Object;

  constructor(message: string, data: ?Object) {
    super();
    Object.assign(this, { message, data });
  }
}

// Slack
export class SlackMessageEvent extends Event {
  from: string; channel: string; message: string; isDirect: bool;

  constructor(from: string, channel: string, message: string, isDirect: bool) {
    super();
    Object.assign(this, { from, channel, message, isDirect });
  }
}

// GitHub
export class GHPullRequestEvent extends Event {
  repo: string; id: number; title: string; author: string; url: string; action: string;
  baseRefName: string; headRefName: string; baseSha: string; headSha: string;
  isFromTrustedAuthor: boolean;

  constructor(repo: string, id: number, title: string, author: string, url: string, action: string,
              baseRefName: string, headRefName: string, baseSha: string, headSha: string,
              isFromTrustedAuthor: boolean) {
    super();
    Object.assign(this, { repo, id, title, author, url, action,
                          baseRefName, headRefName, baseSha, headSha, isFromTrustedAuthor });
  }
}


type MapOfEventsType = { [eventType: string]: Array<Event> };
export const recentEvents: MapOfEventsType = {};

const logEvent = (eventType: string, event: Event) => {
  log.info(event, eventType);
  recentEvents[eventType] = recentEvents[eventType] || [];
  recentEvents[eventType].push(event);
  while (recentEvents[eventType].length > 25) {
    // .shift() is good enough for us.
    recentEvents[eventType].shift();
  }
};

export const dispatch = (source: string, event: Event) => {
  const eventType = event.constructor.name;
  event.source = source;
  logEvent(eventType, event);
  eventEmitter.emit(eventType, event);
};

export const listen = (eventType: string, callback: Function) => {
  eventEmitter.on(eventType, callback);
};
