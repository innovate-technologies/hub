// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import log from "app/logs.js";

process.on("uncaughtException", (error: Error) => {
  log.fatal(error);
  process.exit(1);
});

log.info("Starting Hub");

// Initialise the web server
require("app/http.js");

require("app/slack.js");
