import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

export type MailAttachment = { filename: string; content: Uint8Array; contentType?: string };
export type Mail = { to: string; subject: string; html: string; text: string; attachments?: MailAttachment[] };

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = env();
  if (!SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Sends an email. Without SMTP configured (local development) the message is
 * printed to the console so flows like OTP verification still work.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // Attachments are summarised, not dumped: name and size are enough to check a flow.
    const files = (mail.attachments ?? []).map((a) => `\n[mail:dev] Attachment: ${a.filename} (${a.content.byteLength} bytes)`).join("");
    console.info(`\n[mail:dev] To: ${mail.to}\n[mail:dev] Subject: ${mail.subject}${files}\n${mail.text}\n`);
    return;
  }
  const attachments = mail.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType }));
  await t.sendMail({ from: env().MAIL_FROM, ...mail, attachments });
}
