// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import bunyan from "bunyan";

const streams = [
  {
    level: "debug",
    stream: process.stdout,
  },
];

export default bunyan.createLogger({
  name: "hub",
  streams,
});
