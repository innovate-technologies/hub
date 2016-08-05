// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import http from "http";
import util from "util";

import bodyParser from "body-parser";
import config from "config";
import express from "express";
import * as _ from "lodash";
import validator from "validator";

import { Event, recentEvents } from "app/events.js";
import log from "app/logs.js";
import * as utils from "app/utils.js";

// Used in route handlers to catch async exceptions as if they were synchronous.
// const wrapAsync = fn => (...args) => fn(...args).catch(args[2]);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function (req, res, next) {
  req.log = log.child({
    req: {
      method: req.method,
      url: req.url,
      ip: req.ip,
    },
  });
  next();
});

// Status page
app.get("/", (req, res) => {
  if (!config.get("publicStatus.enabled")) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.set("Content-Type", "text/html");
  res.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Status for Hub</title></head><body>');
  res.write("<h2>Status for Hub</h2>");
  const printRecentEvents = (events: Array<Event>): void => {
    res.write("<pre>");
    utils.reverseForEach(events, (event: Event) =>
      res.write(util.format("%s   %s\n", event.date.toISOString(),
                validator.escape(utils.objectToString(_.omit(event, "date")))))
    );
    res.write("</pre>");
  };
  for (const eventType of Object.keys(recentEvents)) {
    res.write(`<h3>Recent events for ${eventType}</h3>`);
    printRecentEvents(recentEvents[eventType]);
  }
  res.write("<style>body { font-family: Roboto, serif; }</style></body></html>");
  res.send();
});

// Error handlers
app.use(function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not found",
  });
});

app.use(function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  req.log.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message || "Unknown error",
  });
});

const PORT = config.get("port");
http.createServer(app).listen(PORT);
log.info("Web server listening on port " + PORT);
