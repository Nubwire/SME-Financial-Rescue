(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------
  // Same-origin by default (Worker mounted on /api/* via Pages Functions
  // or a Pages "Service Binding" / route). Override if the Worker is
  // deployed on a separate subdomain.
  const API_BASE = window.__API_BASE__ || "";

  // ------------------------------------------------------------------
  // Question definitions
  // ------------------------------------------------------------------
  const QUESTIONS = [
    { id: "q1", key: "revenue", section: "Revenue",
      title: "Approximate annual revenue:",
      options: ["Under $500k","$500k–$1m","$1m–$5m","$5m–$20m","Over $20m"] },

    { id: "q2", key: "margin", section: "Profitability",
      title: "Approximately what is your current net profit margin?",
      options: ["Loss-making","0–5%","5–10%","10–20%","More than 20%","Don't know"] },

    { id: "q3", key: "profit_trend", section: "Profitability",
      title: "Compared with 12 months ago, is your profit:",
      options: ["Increasing","About the same","Falling","Don't know"] },

    { id: "q4", key: "cash_runway", section: "Cash",
      title: "How many months of normal operating expenses could your current cash reserves cover?",
      options: ["Less than 1 month","1–2 months","3–6 months","More than 6 months","Don't know"] },

    { id: "q5", key: "cash_shortage", section: "Cash",
      title: "Does the business regularly experience cash shortages even when sales are strong?",
      options: ["Frequently","Sometimes","Rarely","Never"] },

    { id: "q6", key: "dso", section: "Debtors",
      title: "How quickly do customers generally pay?",
      options: ["Within 14 days","15–30 days","31–60 days","61–90 days","More than 90 days","Don't know"] },

    { id: "q7", key: "overdue", section: "Debtors",
      title: "Are overdue customer invoices a problem?",
      options: ["Major problem","Moderate problem","Minor problem","Not a problem"] },

    { id: "q8", key: "has_inventory", section: "Inventory",
      title: "Does the business carry significant inventory?",
      options: ["Yes","No","Not applicable"] },

    { id: "q9", key: "slow_inventory", section: "Inventory",
      title: "Is inventory regularly sitting for longer than expected?",
      options: ["Yes","Sometimes","No","Don't know"],
      dependsOn: { key: "has_inventory", values: ["Yes"] } },

    { id: "q10", key: "supplier_terms", section: "Suppliers",
      title: "How quickly do you generally have to pay suppliers?",
      options: ["Within 7 days","8–30 days","31–60 days","More than 60 days","Don't know"] },

    { id: "q11", key: "has_debt", section: "Debt",
      title: "Does the business have significant loans, overdrafts or other debt?",
      options: ["Yes","No"] },

    { id: "q12", key: "debt_pressure", section: "Debt",
      title: "Are debt repayments putting pressure on monthly cash flow?",
      options: ["Yes","Sometimes","No","Not applicable"],
      dependsOn: { key: "has_debt", values: ["Yes"] } },

    { id: "q13", key: "tax_pressure", section: "Tax",
      title: "Are GST, PAYG, payroll tax or other tax obligations ever difficult to pay on time?",
      options: ["Frequently","Sometimes","Rarely","Never","Not applicable"] },

    { id: "q14", key: "owner_injection", section: "Owner",
      title: "Has the owner had to inject personal money into the business during the past 12 months?",
      options: ["Several times","Once","No","Prefer not to say"] },

    { id: "q15", key: "overall", section: "Overall",
      title: "Which statement best describes the business?",
      options: [
        "We are growing and cash is comfortable.",
        "We are growing but constantly short of cash.",
        "Sales are stable but cash is tight.",
        "Sales are falling and cash is tight.",
        "We are profitable but don't understand where the cash goes.",
        "We are currently under significant financial pressure.",
        "I'm not sure."
      ] }
  ];

  // ------------------------------------------------------------------
  // Scoring (client-side preview; server recomputes authoritative score)
  // Each of the 5 categories → 0–20. Total 0–100.
  // ------------------------------------------------------------------
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
      s = 2; // low inherent inventory risk
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

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

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

  function pillFor(score) {
    if (score <= 6) return { label: "Low", cls: "low" };
    if (score <= 13) return { label: "Medium", cls: "medium" };
    return { label: "High", cls: "high" };
  }

  // ------------------------------------------------------------------
  // Issue explanations
  // ------------------------------------------------------------------
  function buildIssues(answers, sc) {
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

  // ------------------------------------------------------------------
  // UTM capture
  // ------------------------------------------------------------------
  function getUtm() {
    const p = new URLSearchParams(location.search);
    return {
      utm_source: p.get("utm_source") || "",
      utm_medium: p.get("utm_medium") || "",
      utm_campaign: p.get("utm_campaign") || ""
    };
  }

  // ------------------------------------------------------------------
  // Analytics stub (privacy-conscious)
  // ------------------------------------------------------------------
  function track(event, props) {
    // Intentionally minimal. Replace with Meta Pixel / Conversions API later.
    try {
      if (window.__smeTrack) window.__smeTrack(event, props || {});
      else if (window.console && location.hostname === "localhost") {
        console.debug("[track]", event, props || {});
      }
    } catch (_) { /* no-op */ }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    answers: {},
    activeQuestions: [],
    index: 0,
    scores: null,
    category: null,
    utm: getUtm(),
    started: false,
    leadId: null
  };

  const $ = (sel) => document.querySelector(sel);
  const views = {
    landing: $("#landing"),
    quiz: $("#quiz"),
    capture: $("#capture"),
    results: $("#results")
  };

  function showView(name) {
    Object.values(views).forEach(v => v.classList.remove("active"));
    views[name].classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // ------------------------------------------------------------------
  // Questionnaire rendering
  // ------------------------------------------------------------------
  function buildActiveQuestions() {
    state.activeQuestions = QUESTIONS.filter(q => {
      if (!q.dependsOn) return true;
      const v = state.answers[q.dependsOn.key];
      return q.dependsOn.values.includes(v);
    });
  }

  function renderQuestion() {
    const q = state.activeQuestions[state.index];
    const container = $("#question-container");
    const total = state.activeQuestions.length;
    const step = state.index + 1;

    $("#step-label").textContent = `Step ${step} of ${total}`;
    const pct = Math.round((state.index / total) * 100);
    $("#step-pct").textContent = `${pct}%`;
    $("#progress-fill").style.width = `${pct}%`;

    const current = state.answers[q.key];

    container.innerHTML = `
      <h2 class="q-title">${escapeHtml(q.title)}</h2>
      <div class="options" role="radiogroup" aria-label="${escapeHtml(q.title)}">
        ${q.options.map((opt) => `
          <label class="option ${current === opt ? "selected" : ""}">
            <input type="radio" name="${q.id}" value="${escapeHtml(opt)}" ${current === opt ? "checked" : ""} />
            <span class="radio-mark" aria-hidden="true"></span>
            <span>${escapeHtml(opt)}</span>
          </label>
        `).join("")}
      </div>
    `;

    container.querySelectorAll(`input[name="${q.id}"]`).forEach(input => {
      input.addEventListener("change", () => {
        state.answers[q.key] = input.value;
        // If this question's answer changes and later questions depend on it,
        // drop any now-irrelevant downstream answers.
        pruneDependentAnswers(q.key);
        buildActiveQuestions();
        // Re-clamp index in case the active list shrank/grew before current index.
        state.index = Math.min(state.index, state.activeQuestions.length - 1);
        syncSelectedUI();
        $("#next-btn").disabled = false;
        track("question_answered", { question: q.key, section: q.section });
      });
    });

    $("#back-btn").hidden = state.index === 0;
    $("#next-btn").disabled = !state.answers[q.key];
    $("#next-btn").textContent = step === total ? "See My Score" : "Next";
  }

  function syncSelectedUI() {
    const q = state.activeQuestions[state.index];
    if (!q) return;
    const current = state.answers[q.key];
    document.querySelectorAll("#question-container .option").forEach(label => {
      const input = label.querySelector("input");
      label.classList.toggle("selected", input.value === current);
    });
  }

  function pruneDependentAnswers(changedKey) {
    QUESTIONS.forEach(q => {
      if (q.dependsOn && q.dependsOn.key === changedKey) {
        const stillApplies = q.dependsOn.values.includes(state.answers[changedKey]);
        if (!stillApplies) delete state.answers[q.key];
      }
    });
  }

  function goNext() {
    const isLast = state.index === state.activeQuestions.length - 1;
    if (isLast) {
      track("quiz_completed", {});
      showView("capture");
      return;
    }
    state.index += 1;
    renderQuestion();
  }

  function goBack() {
    if (state.index === 0) return;
    state.index -= 1;
    renderQuestion();
  }

  // ------------------------------------------------------------------
  // Capture + submit
  // ------------------------------------------------------------------
  async function submitLead(payload) {
    const res = await fetch(`${API_BASE}/api/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      let message = "Something went wrong. Please try again.";
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch (_) { /* ignore parse errors */ }
      throw new Error(message);
    }
    return res.json();
  }

  function renderResults(scores, category, issues) {
    $("#score-total").textContent = scores.total;
    $("#score-category").textContent = category.label;
    $("#score-category").dataset.key = category.key;
    $("#score-summary").textContent = category.summary;

    const categories = [
      { label: "Cash reserves", value: scores.cash },
      { label: "Customer payments", value: scores.debtors },
      { label: "Profit margins", value: scores.profitability },
      { label: "Inventory", value: scores.inventory },
      { label: "Debt & commitments", value: scores.debt }
    ];

    $("#category-list").innerHTML = categories.map(c => {
      const pill = pillFor(c.value);
      return `
        <li>
          <span class="cat-label">${escapeHtml(c.label)}</span>
          <span class="pill ${pill.cls}">${pill.label}</span>
        </li>
      `;
    }).join("");

    $("#issues-list").innerHTML = issues.map(issue => `
      <li>
        <strong>${escapeHtml(issue.title)}</strong>
        ${escapeHtml(issue.body)}
      </li>
    `).join("");
  }

  async function handleCaptureSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const errorEl = $("#capture-error");
    errorEl.hidden = true;

    const first_name = form.first_name.value.trim();
    const email = form.email.value.trim();
    const revenue_band = form.revenue_band.value;
    const consent = form.consent.checked;

    if (!first_name || !email || !revenue_band) {
      errorEl.textContent = "Please fill in your name, email and business size.";
      errorEl.hidden = false;
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "Please enter a valid email address.";
      errorEl.hidden = false;
      return;
    }

    const submitBtn = $("#capture-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Calculating…";

    // Compute a client-side preview immediately so the UI feels instant;
    // the server recomputes authoritatively and we reconcile below.
    const previewScores = computeScores(state.answers);
    const previewCategory = categoryFor(previewScores.total);
    const previewIssues = buildIssues(state.answers, previewScores);
    state.scores = previewScores;
    state.category = previewCategory;

    try {
      const result = await submitLead({
        first_name,
        email,
        revenue_band,
        consent,
        answers: state.answers,
        utm: state.utm,
        page_url: location.href,
        referrer: document.referrer || ""
      });

      const finalScores = result.scores || previewScores;
      const finalCategory = result.category || previewCategory;
      const finalIssues = result.issues || previewIssues;
      state.leadId = result.lead_id || null;
      state.scores = finalScores;
      state.category = finalCategory;

      renderResults(finalScores, finalCategory, finalIssues);
      track("lead_captured", { revenue_band, total: finalScores.total });
      showView("results");
    } catch (err) {
      // Fail gracefully: still show the client-computed score so the
      // user isn't blocked by a transient API/network issue, but flag it.
      renderResults(previewScores, previewCategory, previewIssues);
      showView("results");
      track("lead_capture_failed", { message: err.message });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Show My Results";
    }
  }

  async function handleWaitlistClick() {
    const btn = $("#waitlist-btn");
    btn.disabled = true;
    btn.textContent = "Joining…";
    try {
      await fetch(`${API_BASE}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: state.leadId })
      });
    } catch (_) {
      // Non-blocking: still show confirmation locally.
    }
    btn.hidden = true;
    $("#waitlist-confirm").hidden = false;
    track("waitlist_joined", { lead_id: state.leadId });
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function startQuiz() {
    if (state.started) return;
    state.started = true;
    buildActiveQuestions();
    state.index = 0;
    renderQuestion();
    showView("quiz");
    track("quiz_started", {});
  }

  function init() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    document.querySelectorAll('a[href="#start"]').forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        track("cta_clicked", { source: a.dataset.cta || "unknown" });
        startQuiz();
      });
    });

    $("#next-btn").addEventListener("click", goNext);
    $("#back-btn").addEventListener("click", goBack);
    $("#capture-form").addEventListener("submit", handleCaptureSubmit);
    $("#waitlist-btn").addEventListener("click", handleWaitlistClick);

    track("page_view", { utm: state.utm });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
