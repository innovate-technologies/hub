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

export const listen = (eventType: string, listener: Function) => {
  eventEmitter.on(eventType, (...args) => {
    try {
      const ret = listener(...args);
      if (ret.catch) {
        ret.catch((error: Error) =>
                  log.error(error, "Error (async) while calling listener for " + eventType));
      }
    } catch (error) {
      log.error(error, "Error while calling listener for " + eventType);
    }
  });
};
