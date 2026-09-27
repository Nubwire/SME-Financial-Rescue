/**
 * SME Cash Stress Test — Worker API
 *
 * Endpoints:
 *   POST /api/lead      Store questionnaire answers + contact details,
 *                        compute the authoritative score, return it.
 *   POST /api/waitlist   Flag an existing lead as waitlisted.
 *
 * Bindings expected (see wrangler.toml):
 *   DB              D1 database binding
 *
 * This file intentionally mirrors the client-side scoring logic in
 * public/app.js so the server always has the final say on the score
 * that is stored and emailed, even if a client sends a stale or
 * tampered preview score.
 */

const ALLOWED_ORIGIN = "*"; // Tighten to your production domain before launch.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

// ---------------------------------------------------------------------
// Scoring (kept in sync with public/app.js)
// ---------------------------------------------------------------------
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function scoreCash(a) {
  let s = 0;
  const r = a.cash_runway;
  if (r === "Less than 1 month") s += 10;
  else if (r === "1–2 months") s += 7;
  else if (r === "3–6 months") s += 3;
  else if (r === "Don't know") s += 6;

  const c = a.cash_shortage;
  if (c === "Frequently") s += 6;
  else if (c === "Sometimes") s += 4;
  else if (c === "Rarely") s += 1;

  const o = a.owner_injection;
  if (o === "Several times") s += 4;
  else if (o === "Once") s += 2;

  const t = a.tax_pressure;
  if (t === "Frequently") s += 4;
  else if (t === "Sometimes") s += 2;

  return clamp(s, 0, 20);
}

function scoreDebtors(a) {
  let s = 0;
  const d = a.dso;
  if (d === "More than 90 days") s += 10;
  else if (d === "61–90 days") s += 8;
  else if (d === "31–60 days") s += 5;
  else if (d === "15–30 days") s += 2;
  else if (d === "Don't know") s += 5;

  const ov = a.overdue;
  if (ov === "Major problem") s += 10;
  else if (ov === "Moderate problem") s += 6;
  else if (ov === "Minor problem") s += 2;

  return clamp(s, 0, 20);
}

function scoreProfitability(a) {
  let s = 0;
  const m = a.margin;
  if (m === "Loss-making") s += 12;
  else if (m === "0–5%") s += 8;
  else if (m === "5–10%") s += 4;
  else if (m === "Don't know") s += 6;

  const tr = a.profit_trend;
  if (tr === "Falling") s += 8;
  else if (tr === "About the same") s += 4;
  else if (tr === "Don't know") s += 4;

  return clamp(s, 0, 20);
}

function scoreInventory(a) {
  let s = 0;
  if (a.has_inventory === "Yes") {
    const si = a.slow_inventory;
    if (si === "Yes") s += 16;
    else if (si === "Sometimes") s += 10;
    else if (si === "Don't know") s += 8;
    else s += 4;
  } else {
    s = 2;
  }

  const sup = a.supplier_terms;
  if (sup === "Within 7 days") s += 4;
  else if (sup === "8–30 days") s += 2;
  else if (sup === "Don't know") s += 3;

  return clamp(s, 0, 20);
}

function scoreDebt(a) {
  let s = 0;
  if (a.has_debt === "Yes") {
    s += 6;
    const dp = a.debt_pressure;
    if (dp === "Yes") s += 12;
    else if (dp === "Sometimes") s += 7;
    else if (dp === "Not applicable") s += 2;
  }
  const t = a.tax_pressure;
  if (t === "Frequently") s += 4;
  else if (t === "Sometimes") s += 2;
  return clamp(s, 0, 20);
}

function computeScores(answers) {
  const cash = scoreCash(answers);
  const debtors = scoreDebtors(answers);
  const profitability = scoreProfitability(answers);
  const inventory = scoreInventory(answers);
  const debt = scoreDebt(answers);
  const total = cash + debtors + profitability + inventory + debt;
  return { cash, debtors, profitability, inventory, debt, total };
}

function categoryFor(total) {
  if (total <= 20) return { label: "Low apparent cash stress", key: "low",
    summary: "Your answers suggest cash-flow pressure is currently limited. Keep monitoring the areas below." };
  if (total <= 40) return { label: "Watch closely", key: "low",
    summary: "Your answers indicate some early warning signs. A few areas deserve attention before they tighten further." };
  if (total <= 60) return { label: "Moderate cash pressure", key: "medium",
    summary: "Your answers indicate moderate cash-flow pressure. Several areas may be absorbing more cash than expected." };
  if (total <= 80) return { label: "High cash pressure", key: "high",
    summary: "Your answers indicate elevated cash-flow pressure. Several areas deserve immediate attention." };
  return { label: "Severe cash pressure", key: "high",
    summary: "Your answers indicate severe cash-flow pressure. It would be worth speaking with a qualified professional about your situation." };
}

function buildIssues(sc) {
  const issues = [];

  if (sc.debtors >= 12) {
    issues.push({
      title: "Slow customer payments",
      body: "If customers take 60+ days to pay, sales can increase while available cash actually falls. Money owed to you is not money you can spend."
    });
  }
  if (sc.inventory >= 12) {
    issues.push({
      title: "Inventory",
      body: "Money tied up in slow-moving stock cannot be used to pay wages, suppliers, debt or tax. Inventory is one of the most common hidden cash drains."
    });
  }
  if (sc.profitability >= 12) {
    issues.push({
      title: "Margin pressure",
      body: "Small changes in gross margin can have a surprisingly large effect on the amount of cash generated by the business. Falling or thin margins mean less cash per sale."
    });
  }
  if (sc.cash >= 12) {
    issues.push({
      title: "Thin cash reserves",
      body: "Limited cash reserves leave little room to absorb a late payment, a slow month, or an unexpected cost. Building a buffer is one of the highest-value actions available."
    });
  }
  if (sc.debt >= 12) {
    issues.push({
      title: "Debt and fixed commitments",
      body: "Regular loan repayments and finance commitments compete directly with wages, suppliers and tax for the same limited cash. When sales dip, these obligations do not."
    });
  }

  if (issues.length === 0) {
    issues.push({
      title: "No single dominant pressure point",
      body: "Your answers do not flag a single major source of cash pressure. Keep monitoring the categories above and revisit this test if conditions change."
    });
  }

  return issues.slice(0, 3);
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------
const REVENUE_BANDS = ["Under $500k", "$500k–$1m", "$1m–$5m", "$5m–$20m", "Over $20m"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLeadPayload(body) {
  if (!body || typeof body !== "object") return "Invalid request body.";
  if (!body.first_name || typeof body.first_name !== "string" || body.first_name.length > 80) {
    return "Please provide a valid first name.";
  }
  if (!body.email || typeof body.email !== "string" || !EMAIL_RE.test(body.email) || body.email.length > 200) {
    return "Please provide a valid email address.";
  }
  if (!REVENUE_BANDS.includes(body.revenue_band)) {
    return "Please select a valid business size.";
  }
  if (!body.answers || typeof body.answers !== "object") {
    return "Missing questionnaire answers.";
  }
  return null;
}

function genId() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------
async function handleLead(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON body.");
  }

  const validationError = validateLeadPayload(body);
  if (validationError) return badRequest(validationError);

  const scores = computeScores(body.answers);
  const category = categoryFor(scores.total);
  const issues = buildIssues(scores);

  const leadId = genId();
  const now = new Date().toISOString();
  const utm = body.utm || {};

  try {
    await env.DB.prepare(
      `INSERT INTO leads (
         id, first_name, email, revenue_band, consent,
         utm_source, utm_medium, utm_campaign,
         page_url, referrer,
         score_cash, score_debtors, score_profitability, score_inventory, score_debt, score_total,
         category_key, waitlisted, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`
    ).bind(
      leadId,
      body.first_name.trim(),
      body.email.trim().toLowerCase(),
      body.revenue_band,
      body.consent ? 1 : 0,
      utm.utm_source || "",
      utm.utm_medium || "",
      utm.utm_campaign || "",
      body.page_url || "",
      body.referrer || "",
      scores.cash, scores.debtors, scores.profitability, scores.inventory, scores.debt, scores.total,
      category.key,
      now
    ).run();

    await env.DB.prepare(
      `INSERT INTO quiz_responses (id, lead_id, answers_json, created_at) VALUES (?,?,?,?)`
    ).bind(genId(), leadId, JSON.stringify(body.answers), now).run();
  } catch (err) {
    // Surface a generic error; log details server-side via console.error
    // (visible in `wrangler tail`).
    console.error("DB insert failed", err);
    return json({ error: "Could not save your results. Please try again shortly." }, 500);
  }

  // TODO: trigger the full report email here (e.g. via Resend, Postmark,
  // Mailgun or Cloudflare Email Workers) using leadId / scores / category.

  return json({ lead_id: leadId, scores, category, issues });
}

async function handleWaitlist(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON body.");
  }

  if (!body || !body.lead_id || typeof body.lead_id !== "string") {
    return badRequest("Missing lead_id.");
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE leads SET waitlisted = 1 WHERE id = ?`
    ).bind(body.lead_id).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({ error: "Lead not found." }, 404);
    }
  } catch (err) {
    console.error("DB update failed", err);
    return json({ error: "Could not update your waitlist status." }, 500);
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/api/lead" && request.method === "POST") {
      return handleLead(request, env);
    }

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      return handleWaitlist(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
};
