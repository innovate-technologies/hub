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
