// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import { execFile } from "child_process";
import dns from "dns";
import util from "util";

import * as events from "app/events.js";

export const exec = (binary: string, args: Array<string>, options: Object = {}) => {
  events.dispatch("utils/exec", new events.InternalEvent("exec called", { binary, args }));
  return new Promise((resolve: Function, reject: Function) => {
    execFile(binary, args, options, (err: ?Error, stdout: Buffer) => {
      if (err) {
        return reject(err);
      }
      resolve(stdout);
    });
  });
};

export const reverseDns = (ip: string): Promise<string> => new Promise((resolve, reject) => {
  dns.reverse(ip, (error, hostnames) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(hostnames[0] || "");
  });
});

export const escapeShell = (command: string) => {
  return '"' + command.replace(/(["'$`\\])/g, "\\$1") + '"';
};

export const objectToString = (...args: any): string => {
  return util.inspect(...args, { depth: null, maxArrayLength: null, breakLength: Infinity });
};

export const reverseForEach = (array: Array<any>, fn: Function): void => {
  for (let i = array.length - 1; i >= 0; --i) {
    fn(array[i]);
  }
};

export class AccessDeniedError extends Error {
  statusCode: number;
  constructor(message: ?string) {
    super();
    this.message = message || "Access denied";
    this.stack = (new Error()).stack;
    this.name = this.constructor.name;
    this.statusCode = 403;
  }
}
