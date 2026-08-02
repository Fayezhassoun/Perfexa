// Weekly report cron endpoint (CONTRACTS §6/§11): builds the RICH weekly report
// for every org and emails owners when RESEND_API_KEY is set. Behind CRON_SECRET.
// Rewired 2026-08-02 to the rich-report flow (HTML template, idempotent per ISO week).
export { POST } from '@/server/cron/weekly-report';
