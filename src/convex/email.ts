/**
 * Shared transactional email helpers (Resend).
 *
 * Required environment variables (set in the Convex dashboard):
 * - RESEND_API_KEY: Resend API key.
 * - EMAIL_FROM: Sender, e.g. `My App <no-reply@yourdomain.com>`.
 *   Falls back to RESET_EMAIL_FROM for backwards compatibility.
 * - EMAIL_REPLY_TO (optional): Reply-to address.
 */

interface SendEmailArgs {
	to: string;
	subject: string;
	html: string;
}

/**
 * Send an email via Resend. Throws on failure so callers (password reset,
 * email change, invitations) surface delivery problems instead of silently
 * reporting success.
 */
export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
	const resendApiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM || process.env.RESET_EMAIL_FROM;
	const replyTo = process.env.EMAIL_REPLY_TO || process.env.RESET_EMAIL_REPLY_TO;
	if (!resendApiKey) {
		throw new Error(`RESEND_API_KEY not set. Unable to send "${subject}" email.`);
	}
	if (!from) {
		throw new Error(`EMAIL_FROM or RESET_EMAIL_FROM not set. Unable to send "${subject}" email.`);
	}
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${resendApiKey}`
		},
		body: JSON.stringify({
			from,
			to,
			subject,
			...(replyTo ? { reply_to: replyTo } : {}),
			html
		})
	});
	if (!res.ok) {
		console.error(`Resend API error sending "${subject}" email:`, res.status);
		throw new Error(`Failed to send "${subject}" email (${res.status})`);
	}
}

interface ActionEmailArgs {
	greeting: string;
	bodyLines: string[];
	ctaLabel: string;
	ctaUrl: string;
	footerLine: string;
}

/** Simple shared HTML template for emails with a single call-to-action button. */
export function actionEmailHtml({
	greeting,
	bodyLines,
	ctaLabel,
	ctaUrl,
	footerLine
}: ActionEmailArgs): string {
	const body = bodyLines.map((line) => `<p>${line}</p>`).join('\n');
	return `<p>${greeting}</p>
${body}
<p><a href="${ctaUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:6px;text-decoration:none">${ctaLabel}</a></p>
<p>If the button doesn't work, copy and paste this URL into your browser:</p>
<p><a href="${ctaUrl}">${ctaUrl}</a></p>
<p>${footerLine}</p>`;
}

/** Escape user-provided values interpolated into email HTML. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
