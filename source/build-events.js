// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import * as events from "app/events.js";

export class ReleaseBuildEvent extends events.Event {
  url: string; builder: string; repo: string; revision: string; state: BuildEventState;
  constructor(url: string, builder: string, repo: string, revision: string, state: BuildEventState) {
    super();
    Object.assign(this, { url, builder, repo, revision, state });
  }
}

export type BuildEventState = | "pending" | "success" | "failure";
export class BuildEvent extends events.Event {
  url: string; builder: string; repo: string; revision: string; pr: number; state: BuildEventState;
  description: string; prUrl: string;
  constructor(url: string, builder: string, repo: string, revision: string, pr: number,
              state: BuildEventState, description: string) {
    super();
    Object.assign(this, { url, builder, repo, revision, pr, state, description });
    this.prUrl = "https://github.com/" + repo + "/pull/" + pr;
  }
}
