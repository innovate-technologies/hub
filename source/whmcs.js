// Copyright (c) 2016 Innovate Technologies
// This file is part of hub. Refer to license.txt for more information.
// @flow

import * as events from "app/events.js";

export class Ticket {
  id: string; title: string; clientId: string; clientName: string; message: string;
  link: string;

  constructor(id: string, title: string, clientId: string, clientName: string, message: string) {
    Object.assign(this, { id, title, clientId, clientName, message });
    this.link = `https://my.shoutca.st/admin/supporttickets?action=view&id=${this.id}`;
  }
}

export class WHMCSTicketOpenEvent extends events.Event {
  ticket: Ticket; who: string;

  constructor(ticket: Ticket, who: string) {
    super();
    Object.assign(this, { ticket, who });
  }
}

export class WHMCSTicketFlagEvent extends events.Event {
  ticket: Ticket; who: string; flaggedTo: string;

  constructor(ticket: Ticket, who: string, flaggedTo: string) {
    super();
    Object.assign(this, { ticket, who, flaggedTo });
  }
}

export class WHMCSTicketStatusChangeEvent extends events.Event {
  ticket: Ticket; who: string; newStatus: string;

  constructor(ticket: Ticket, who: string, newStatus: string) {
    super();
    Object.assign(this, { ticket, who, newStatus });
  }
}

export type WHMCSTicketObjectType =
  | "ReplyFromClient"
  | "ReplyFromStaff"
  | "Note";
export class WHMCSTicketObjectEvent extends events.Event {
  type: WHMCSTicketObjectType; ticket: Ticket; who: string; message: string; status: string;

  constructor(type: WHMCSTicketObjectType, ticket: Ticket, who: string, message: string, status: string) {
    super();
    Object.assign(this, { type, ticket, who, message, status });
  }
}
