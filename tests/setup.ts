// Deterministic environment for code that reads lib/env.ts.
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:1/unused";
process.env.APP_URL = "https://app.example.in";
process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough-1234";
process.env.IP_HASH_SALT = "test-salt";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
process.env.RAZORPAY_PLAN_STARTER = "plan_starter";
process.env.RAZORPAY_PLAN_GROWTH = "plan_growth";
