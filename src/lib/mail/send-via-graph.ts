/**
 * mail/send-via-graph.ts - send transactional email via Microsoft Graph
 * (`/users/{from}/sendMail`) using the app-only client-credentials flow.
 *
 * Ported from Wolfpack Instinct / beyond-sku. Wolfpack already pays for M365,
 * so Mail.Send (Application) + admin consent gives free, branded outbound
 * email with zero DNS work - no third-party vendor, no SPF/DKIM dance, no
 * per-email cost.
 *
 * Behavior:
 *   - From-mailbox: env MS_MAIL_FROM (UPN of the sending mailbox). When unset,
 *     returns { delivered:false, reason:"no_mail_from" } so the caller falls
 *     back to handing the admin a copyable accept link.
 *   - Token: getAppOnlyToken() returns null when MS env vars are missing OR
 *     admin consent hasn't been granted → { reason:"no_app_token" }.
 *   - 403 after token acquisition usually means Mail.Send isn't granted OR a
 *     per-mailbox Application Access Policy excludes MS_MAIL_FROM →
 *     { reason:"scope_missing" }.
 *   - Network / other non-202 → { reason:"provider_error" }.
 *   - NEVER throws. The invite row has already persisted by the time this
 *     runs - a mail misconfig must not 500 the request.
 */

import { getAppOnlyToken } from "@/lib/microsoft-graph";

const GRAPH_SEND_URL = "https://graph.microsoft.com/v1.0/users";

export type GraphSendReason =
  | "ok"
  | "no_mail_from"
  | "no_app_token"
  | "scope_missing"
  | "provider_error";

export interface GraphSendArgs {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional display name composed into the From envelope alongside the
   *  mailbox UPN. Falls back to MS_MAIL_FROM_NAME, then a neutral default. */
  fromName?: string;
}

export interface GraphSendResult {
  delivered: boolean;
  reason: GraphSendReason;
  /** Surfaced on 4xx/5xx for triage. Trimmed to 200 chars to keep Vercel log
   *  lines readable. */
  detail?: string;
}

export function isGraphMailConfigured(): boolean {
  return Boolean(
    process.env.MS_MAIL_FROM && process.env.MS_MAIL_FROM.includes("@"),
  );
}

export async function sendViaGraph(
  args: GraphSendArgs,
): Promise<GraphSendResult> {
  const fromMailbox = process.env.MS_MAIL_FROM;
  if (!fromMailbox || !fromMailbox.includes("@")) {
    return { delivered: false, reason: "no_mail_from" };
  }

  const token = await getAppOnlyToken();
  if (!token) {
    return { delivered: false, reason: "no_app_token" };
  }

  const fromName =
    args.fromName ?? process.env.MS_MAIL_FROM_NAME ?? "Wolfpack Auto";

  /* saveToSentItems=true keeps a Sent record in the mailbox so operators can
     audit what the system sent - vital for "did the invite actually go"
     debugging. */
  const body = {
    message: {
      subject: args.subject,
      from: {
        emailAddress: { address: fromMailbox, name: fromName },
      },
      body: { contentType: "HTML", content: args.html },
      toRecipients: [{ emailAddress: { address: args.to } }],
    },
    saveToSentItems: true,
  };

  let res: Response;
  try {
    res = await fetch(
      `${GRAPH_SEND_URL}/${encodeURIComponent(fromMailbox)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    return {
      delivered: false,
      reason: "provider_error",
      detail: `network: ${(err as Error).message}`.slice(0, 200),
    };
  }

  if (res.status === 202) {
    return { delivered: true, reason: "ok" };
  }

  const detail = await res.text().catch(() => "");
  if (res.status === 403) {
    /* Mail.Send not granted OR Application Access Policy excludes
       MS_MAIL_FROM. The setup runbook covers both. */
    return { delivered: false, reason: "scope_missing", detail: detail.slice(0, 200) };
  }
  return {
    delivered: false,
    reason: "provider_error",
    detail: `${res.status}: ${detail.slice(0, 200)}`,
  };
}
