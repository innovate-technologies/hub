// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import * as events from "app/events.js";

export class GHPullRequestEvent extends events.Event {
  repo: string; id: number; title: string; author: string; url: string; action: string;
  baseRefName: string; headRefName: string; baseSha: string; headSha: string;
  isFromTrustedAuthor: boolean;

  constructor(repo: string, id: number, title: string, author: string, url: string, action: string,
              baseRefName: string, headRefName: string, baseSha: string, headSha: string,
              isFromTrustedAuthor: boolean) {
    super();
    Object.assign(this, { repo, id, title, author, url, action,
                          baseRefName, headRefName, baseSha, headSha, isFromTrustedAuthor });
  }
}
