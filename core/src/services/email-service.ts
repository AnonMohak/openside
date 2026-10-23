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

function inviteHtml(params: {
	title: string;
	description?: string | null;
	when: string;
	joinUrl: string;
	hostName: string;
}): string {
	const { title, description, when, joinUrl, hostName } = params;
	return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 4px">${title}</h2>
    <p style="margin:0 0 16px;color:#555">${hostName} invited you to a meeting on Openside.</p>
    ${description ? `<p style="margin:0 0 16px;color:#333">${description}</p>` : ""}
    <p style="margin:0 0 8px"><strong>When:</strong> ${when}</p>
    <a href="${joinUrl}" style="display:inline-block;margin-top:12px;background:#15803d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Join space</a>
    <p style="margin:16px 0 0;color:#888;font-size:13px">Or paste this link: <br/>${joinUrl}</p>
    <p style="margin:16px 0 0;color:#aaa;font-size:12px">A calendar invite (.ics) is attached.</p>
  </div>`;
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

	const webUrl = (process.env.WEB_URL ?? "").replace(/\/$/, "");
	const joinUrl = `${webUrl}/${params.joinCode}`;
	const start = params.scheduledFor;
	const durationMs =
		(params.durationMinutes ?? DEFAULT_MEETING_DURATION_MINUTES) * 60 * 1000;
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
	const html = inviteHtml({
		title: params.title,
		description: params.description,
		when,
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

function liveInviteHtml(params: {
	title: string;
	description?: string | null;
	joinUrl: string;
	hostName: string;
}): string {
	const { title, description, joinUrl, hostName } = params;
	return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 4px">${title}</h2>
    <p style="margin:0 0 16px;color:#555">${hostName} invited you to join a meeting on Openside.</p>
    ${description ? `<p style="margin:0 0 16px;color:#333">${description}</p>` : ""}
    <a href="${joinUrl}" style="display:inline-block;margin-top:12px;background:#15803d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Join space</a>
    <p style="margin:16px 0 0;color:#888;font-size:13px">Or paste this link: <br/>${joinUrl}</p>
  </div>`;
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

	const webUrl = (process.env.WEB_URL ?? "").replace(/\/$/, "");
	const joinUrl = `${webUrl}/${params.joinCode}`;
	const html = liveInviteHtml({
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
	});

	return { sent: 1, skipped: false };
}
