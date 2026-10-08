import "server-only";
import { z } from "zod";

const optional = z.string().optional().default("");

const schema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  IP_HASH_SALT: z.string().min(8, "IP_HASH_SALT is required"),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: z.string().default("HighPre <no-reply@highpre.com>"),
  /** Header holding the real client IP, set by your proxy. Caddy: x-real-ip. Cloudflare: cf-connecting-ip. */
  CLIENT_IP_HEADER: z.string().toLowerCase().default("x-real-ip"),
  /** Bearer token for /api/cron/* (reminder emails, cleanup). */
  CRON_SECRET: optional,
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  RAZORPAY_PLAN_STARTER: optional,
  RAZORPAY_PLAN_GROWTH: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Validated environment, read lazily so `next build` works without secrets.
 * Throws a readable error the first time a misconfigured value is used.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  cached = { ...parsed.data, APP_URL: parsed.data.APP_URL.replace(/\/$/, "") };
  return cached;
}

/** Billing works only when keys, the webhook secret and both plan IDs are set. */
export function billingConfigured(): boolean {
  const e = env();
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET && e.RAZORPAY_WEBHOOK_SECRET && e.RAZORPAY_PLAN_STARTER && e.RAZORPAY_PLAN_GROWTH);
}
