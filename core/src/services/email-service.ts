import { buildIcs } from "../lib/ics";

// Fallback when the scheduler doesn't pass an explicit meeting length.
const DEFAULT_MEETING_DURATION_MINUTES = 60;

const RESEND_API_URL = "https://api.resend.com/emails";

interface EmailAttachment {
	filename: string;
	/** Base64-encoded file content. */
	content: string;
	content_type?: string;
}

interface EmailMessage {
	from: string;
	to: string;
	subject: string;
	html: string;
	/** Plain-text alternative for clients that don't render HTML. */
	text: string;
	attachments?: EmailAttachment[];
}

// Resend credentials from env. Returns null when they aren't configured so
// invite sending is skipped instead of crashing the schedule call.
function getResendConfig(): { apiKey: string; from: string } | null {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!apiKey || !from) return null;
	return { apiKey, from };
}

// Send one email through Resend's REST API. Throws on a non-2xx response so a
// failed send (bad key, unverified domain, rejected recipient) is never
// miscounted as sent.
async function sendEmail(apiKey: string, message: EmailMessage): Promise<void> {
	const res = await fetch(RESEND_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(message),
	});
	if (!res.ok) {
		throw new Error(`Resend ${res.status}: ${await res.text()}`);
	}
}

interface ScheduledInviteParams {
	spaceId: string;
	title: string;
	description?: string | null;
	joinCode: string;
	scheduledFor: Date;
	durationMinutes?: number;
	invitees: string[];
	hostName: string;
	hostEmail?: string | null;
}

function formatWhen(date: Date): string {
	return date.toLocaleString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	});
}

// The app's light theme tokens (web/src/styles/globals.css).
const COLORS = {
	canvas: "#ffffff",
	border: "#dededf",
	fg: "#131316",
	fgMuted: "#5c5c60",
	fgSubtle: "#8a8a8d",
	fgFaint: "#a8a8ab",
	brand: "#0041aa",
};

// Always the public site, never WEB_URL: mail clients fetch images from the
// open internet, so a localhost or private URL would show a broken image.
const PUBLIC_SITE_URL = "https://openside.pro";
const FONT_STACK =
	"'Public Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEADING_STACK = `'Bricolage Grotesque',${FONT_STACK}`;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function webBaseUrl(): string {
	return (process.env.WEB_URL ?? "").replace(/\/$/, "");
}

function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function formatTimeRange(start: Date, end: Date): string {
	const time = (date: Date, withZone: boolean) =>
		date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			...(withZone ? { timeZoneName: "short" } : {}),
		});
	return `${time(start, false)} – ${time(end, true)}`;
}

function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

// Shared shell for every invite: logo, title, a short message, the join
// button and a fallback link on the app's dark background. Table layout +
// inline styles so it renders in Gmail, Outlook and Apple Mail alike.
// Everything user-provided arrives here already escaped.
function inviteLayout(params: {
	preheader: string;
	title: string;
	/** Paragraphs under the title, as HTML. */
	lines: string[];
	description?: string | null;
	joinUrl: string;
	footerNote: string;
}): string {
	const { preheader, title, lines, description, joinUrl, footerNote } = params;
	const safeUrl = escapeHtml(joinUrl);
	const paragraph = (html: string, color: string = COLORS.fgMuted) =>
		`<p style="margin:12px 0 0;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${color};">${html}</p>`;
	const body = [
		...lines.map((line) => paragraph(line)),
		...(description
			? [
					`<p style="margin:20px 0 0;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${COLORS.fgMuted};white-space:pre-line;">${description}</p>`,
				]
			: []),
	].join("\n              ");
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&family=Public+Sans:wght@400;600&display=swap" rel="stylesheet">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.canvas}" style="background:${COLORS.canvas};">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
          <tr>
            <td>
              <a href="${PUBLIC_SITE_URL}" style="text-decoration:none;">
                <img src="${PUBLIC_SITE_URL}/logo/logo-light.png" width="32" height="37" alt="Openside" style="display:block;border:0;">
              </a>
              <h1 style="margin:32px 0 0;font-family:${HEADING_STACK};font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.fg};">${title}</h1>
              ${body}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td bgcolor="${COLORS.brand}" style="border-radius:8px;">
                    <a href="${safeUrl}" style="display:inline-block;padding:11px 22px;font-family:${FONT_STACK};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Join meeting</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.fgSubtle};">
                Or open <a href="${safeUrl}" style="color:${COLORS.brand};text-decoration:none;word-break:break-all;">${safeUrl}</a>
              </p>
              <p style="margin:40px 0 0;padding-top:20px;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:12px;line-height:19px;color:${COLORS.fgFaint};">
                ${footerNote}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function scheduledInviteEmail(params: {
	title: string;
	description?: string | null;
	start: Date;
	end: Date;
	durationMinutes: number;
	joinUrl: string;
	hostName: string;
}): { html: string; text: string } {
	const { start, end, durationMinutes, joinUrl } = params;
	const title = escapeHtml(params.title);
	const host = escapeHtml(params.hostName);
	const date = formatDate(start);
	const time = formatTimeRange(start, end);
	const duration = formatDuration(durationMinutes);

	const html = inviteLayout({
		preheader: `${host} invited you to ${title} on ${date}.`,
		title,
		lines: [
			`<strong style="color:${COLORS.fg};font-weight:600;">${host}</strong> invited you to a recording on Openside.`,
			`<span style="color:${COLORS.fg};">${date}</span><br>${time} · ${duration}`,
		],
		description: params.description ? escapeHtml(params.description) : null,
		joinUrl,
		footerNote:
			"A calendar invite is attached. If you weren't expecting this, you can ignore it.",
	});

	const text = [
		`${params.hostName} invited you to a recording on Openside.`,
		"",
		params.title,
		`When: ${date}, ${time} (${duration})`,
		...(params.description ? ["", params.description] : []),
		"",
		`Join: ${joinUrl}`,
		"",
		"A calendar invite (.ics) is attached.",
	].join("\n");

	return { html, text };
}

/**
 * Email each invitee a meeting invite with a join link and an .ics attachment.
 * Best-effort and non-fatal: if Resend isn't configured (no RESEND_API_KEY /
 * EMAIL_FROM) or a send fails, we log and move on so scheduling the meeting still succeeds. The
 * .ics attachment lets recipients add it to any calendar (Google/Apple/Outlook).
 */
export async function sendScheduledInvites(
	params: ScheduledInviteParams,
): Promise<{ sent: number; skipped: boolean }> {
	const invitees = params.invitees.filter((email) => email?.includes("@"));
	if (invitees.length === 0) {
		return { sent: 0, skipped: true };
	}

	const resend = getResendConfig();

	if (!resend) {
		console.warn(
			"[email] RESEND_API_KEY or EMAIL_FROM not set - skipping invite emails.",
		);
		return { sent: 0, skipped: true };
	}

	const joinUrl = `${webBaseUrl()}/${params.joinCode}`;
	const start = params.scheduledFor;
	const durationMinutes =
		params.durationMinutes ?? DEFAULT_MEETING_DURATION_MINUTES;
	const durationMs = durationMinutes * 60 * 1000;
	const end = new Date(start.getTime() + durationMs);
	const when = formatWhen(start);

	const ics = buildIcs({
		uid: `${params.spaceId}@openside`,
		title: params.title,
		description: params.description ?? undefined,
		start,
		end,
		url: joinUrl,
		organizerName: params.hostName,
		organizerEmail: params.hostEmail ?? undefined,
	});

	const icsBase64 = Buffer.from(ics, "utf-8").toString("base64");
	const { html, text } = scheduledInviteEmail({
		title: params.title,
		description: params.description,
		start,
		end,
		durationMinutes,
		joinUrl,
		hostName: params.hostName,
	});

	let sent = 0;
	await Promise.all(
		invitees.map(async (to) => {
			try {
				await sendEmail(resend.apiKey, {
					from: resend.from,
					to,
					subject: `Invite: ${params.title} - ${when}`,
					html,
					text,
					attachments: [
						{
							filename: "invite.ics",
							content: icsBase64,
							content_type: "text/calendar; method=REQUEST",
						},
					],
				});
				sent += 1;
			} catch (error) {
				console.error(`[email] Failed to send invite to ${to}:`, error);
			}
		}),
	);

	return { sent, skipped: false };
}

interface SpaceInviteParams {
	to: string;
	title: string;
	description?: string | null;
	joinCode: string;
	hostName: string;
}

function liveInviteEmail(params: {
	title: string;
	description?: string | null;
	joinUrl: string;
	hostName: string;
}): { html: string; text: string } {
	const { joinUrl } = params;
	const title = escapeHtml(params.title);
	const host = escapeHtml(params.hostName);

	const html = inviteLayout({
		preheader: `${host} is waiting for you in ${title}.`,
		title,
		lines: [
			`<strong style="color:${COLORS.fg};font-weight:600;">${host}</strong> invited you to join their recording on Openside. It's happening now.`,
		],
		description: params.description ? escapeHtml(params.description) : null,
		joinUrl,
		footerNote: "If you weren't expecting this, you can ignore it.",
	});

	const text = [
		`${params.hostName} invited you to join their recording on Openside. It's happening now.`,
		"",
		params.title,
		...(params.description ? ["", params.description] : []),
		"",
		`Join: ${joinUrl}`,
	].join("\n");

	return { html, text };
}

/**
 * Email a single recipient an invite to join a space right now (no scheduled
 * time, no .ics - just a join link). Best-effort: returns { skipped: true }
 * when Resend isn't configured, and throws only on a genuine send failure so the
 * caller can surface an error to the host.
 */
export async function sendSpaceInvite(
	params: SpaceInviteParams,
): Promise<{ sent: number; skipped: boolean }> {
	const to = params.to.trim().toLowerCase();
	if (!to.includes("@")) {
		return { sent: 0, skipped: true };
	}

	const resend = getResendConfig();

	if (!resend) {
		console.warn(
			"[email] RESEND_API_KEY or EMAIL_FROM not set - skipping invite email.",
		);
		return { sent: 0, skipped: true };
	}

	const joinUrl = `${webBaseUrl()}/${params.joinCode}`;
	const { html, text } = liveInviteEmail({
		title: params.title,
		description: params.description,
		joinUrl,
		hostName: params.hostName,
	});

	await sendEmail(resend.apiKey, {
		from: resend.from,
		to,
		subject: `${params.hostName} invited you to ${params.title}`,
		html,
		text,
	});

	return { sent: 1, skipped: false };
}
