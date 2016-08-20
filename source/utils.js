// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import util from "util";

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
