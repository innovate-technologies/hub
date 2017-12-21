// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import http from "http";
import util from "util";

import bodyParser from "body-parser";
import bufferEq from "buffer-equal-constant-time";
import config from "config";
import crypto from "crypto";
import express from "express";
import { Html5Entities as Entities } from "html-entities";
import * as _ from "lodash";

import * as buildbot from "app/buildbot.js";
import * as centowatch from "app/centowatch.js";
import * as events from "app/events.js";
import * as github from "app/github.js";
import log from "app/logs.js";
import * as utils from "app/utils.js";
import * as whmcs from "app/whmcs.js";

const entities = new Entities();
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
  if (!config.get("publicStatus.enabled") && !(req.ip === "127.0.0.1" || req.ip === "::1")) {
    throw new utils.AccessDeniedError();
  }
  res.set("Content-Type", "text/html");
  res.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Status for Hub</title></head><body>');
  res.write("<h2>Status for Hub</h2>");
  const printRecentEvents = (evts: Array<events.Event>): void => {
    res.write("<pre>");
    utils.reverseForEach(evts, (event: events.Event) =>
      res.write(util.format("%s   %s\n", event.date.toISOString(),
                entities.encode(utils.objectToString(_.omit(event, "date")))))
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

// Buildbot
const BB_HOOK_TOKEN: string = config.get("buildbot.token");
app.post("/buildbot/" + BB_HOOK_TOKEN, (req, res) => {
  events.dispatch("http", new buildbot.BBRawHookEvent(req.body));
  res.status(204).send();
});

// Centowatch
const CENTOWATCH_HOOK_TOKEN: string = config.get("centowatch.token");
app.post("/centowatch/" + CENTOWATCH_HOOK_TOKEN, (req, res) => {
  if (typeof req.body.event !== "string" || typeof req.body.data !== "object") {
    throw new Error("Bad request");
  }
  events.dispatch("http", new centowatch.CentowatchRawHookEvent(req.body.event, req.body.data, req.ip));
  res.status(204).send();
});

// GitHub
const GH_HOOK_SECRET: string = config.get("github.hookSecret");

function signBlob(secret: string, blob: string): string {
  return "sha1=" + crypto.createHmac("sha1", secret).update(blob).digest("hex");
}
function verifySignature(secret: string, blob: string, signature: string): bool {
  return bufferEq(new Buffer(signature), new Buffer(signBlob(secret, blob)));
}

app.post("/github", (req, res) => {
  if (!req.headers["x-hub-signature"]) {
    throw new utils.AccessDeniedError("No signature");
  }
  if (!req.headers["x-github-event"] || !req.headers["x-github-delivery"]) {
    throw new Error("No event or delivery ID");
  }
  if (!verifySignature(GH_HOOK_SECRET, JSON.stringify(req.body), req.headers["x-hub-signature"])) {
    throw new utils.AccessDeniedError("Signature does not match");
  }
  events.dispatch("http", new github.GHRawHookEvent(req.headers["x-github-event"], req.body));
  res.status(204).send();
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
