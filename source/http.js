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

import * as events from "app/events.js";
import log from "app/logs.js";
import * as utils from "app/utils.js";
import * as whmcs from "app/whmcs.js";

// Used in route handlers to catch async exceptions as if they were synchronous.
// const wrapAsync = fn => (...args) => fn(...args).catch(args[2]);

const app = express();
app.enable("trust proxy");
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
    throw new utils.AccessDeniedError();
  }
  res.set("Content-Type", "text/html");
  res.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Status for Hub</title></head><body>');
  res.write("<h2>Status for Hub</h2>");
  const printRecentEvents = (evts: Array<events.Event>): void => {
    res.write("<pre>");
    utils.reverseForEach(evts, (event: events.Event) =>
      res.write(util.format("%s   %s\n", event.date.toISOString(),
                validator.escape(utils.objectToString(_.omit(event, "date")))))
    );
    res.write("</pre>");
  };
  for (const eventType of Object.keys(events.recentEvents)) {
    res.write(`<h3>Recent events for ${eventType}</h3>`);
    printRecentEvents(events.recentEvents[eventType]);
  }
  res.write("<style>body { font-family: Roboto, serif; }</style></body></html>");
  res.send();
});

// WHMCS
const WHMCS_TOKEN: string = config.get("whmcs.token");
app.post("/whmcs/ticket*", (req, res, next) => {
  if (req.body.token !== WHMCS_TOKEN) {
    throw new utils.AccessDeniedError("Invalid token");
  }
  try {
    // This can throw, and we don't care because this is what we want.
    const { id, title, clientId, clientName, message } = req.body.ticket;
    req.ticket = new whmcs.Ticket(id, title, clientId, clientName, message);
  } catch (error) {
    throw new Error("Missing information.");
  }
  next();
});

app.post("/whmcs/ticket-open", (req, res) => {
  const { who } = req.body;
  events.dispatch("http", new whmcs.WHMCSTicketOpenEvent(req.ticket, who));
  res.status(204).send();
});

app.post("/whmcs/ticket-reply-or-note", (req, res) => {
  const { type, who, message, status } = req.body;
  if (!["ReplyFromClient", "ReplyFromStaff", "Note"].includes(type)) {
    throw new Error("Unexpected type.");
  }
  events.dispatch("http", new whmcs.WHMCSTicketObjectEvent(type, req.ticket, who, message, status));
  if (type === "ReplyFromStaff") {
    // Dispatch the status changed ourselves, since WHMCS doesn't do it for us.
    events.dispatch("http", new whmcs.WHMCSTicketStatusChangeEvent(req.ticket, who, status));
  }

  res.status(204).send();
});

app.post("/whmcs/ticket-flag", (req, res) => {
  const { who, flaggedTo } = req.body;
  events.dispatch("http", new whmcs.WHMCSTicketFlagEvent(req.ticket, who, flaggedTo));
  res.status(204).send();
});

app.post("/whmcs/ticket-status-change", (req, res) => {
  const { who, newStatus } = req.body;
  events.dispatch("http", new whmcs.WHMCSTicketStatusChangeEvent(req.ticket, who, newStatus));
  res.status(204).send();
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
