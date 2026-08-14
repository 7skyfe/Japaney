"use strict";

/* ---------------------------------------------------------------------
 * Japaney — outil d'épargne pour le voyage au Japon
 * Vanilla JS, aucune dépendance, données stockées en localStorage.
 * ------------------------------------------------------------------- */

const STORAGE_KEY = "japaney.state.v1";
const RATE_FALLBACK = 184; // ¥ pour 1 € — valeur de secours si l'API est injoignable (hors-ligne / aperçu)
const RATE_API_URL = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY";

const todayISO = () => new Date().toISOString().slice(0, 10);

function defaultState() {
  return {
    goals: {
      japan: {
        label: "🇯🇵 Voyage au Japon",
        target: 10000,
        startDate: todayISO(),
        deadline: "2026-11-01",
        transactions: [],
      },
      other: {
        label: "✈️ Autre objectif",
        target: 5000,
        startDate: todayISO(),
        deadline: "2027-05-01",
        transactions: [],
      },
    },
    rate: { value: RATE_FALLBACK, date: null, fetchedAt: null, isLive: false },
    activeTab: "japan",
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    // fusion défensive : garantit la présence des deux cagnottes même si le schéma évolue
    return {
      goals: {
        japan: { ...base.goals.japan, ...(parsed.goals && parsed.goals.japan) },
        other: { ...base.goals.other, ...(parsed.goals && parsed.goals.other) },
      },
      rate: { ...base.rate, ...parsed.rate },
      activeTab: parsed.activeTab === "other" ? "other" : "japan",
    };
  } catch (e) {
    console.warn("État corrompu, réinitialisation.", e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ------------------------------- Helpers ------------------------------- */

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const jpyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function goalBalance(goal) {
  return goal.transactions.reduce((sum, tx) => sum + (tx.type === "withdrawal" ? -tx.amount : tx.amount), 0);
}

function daysBetween(a, b) {
  const ms = new Date(b + "T00:00:00") - new Date(a + "T00:00:00");
  return Math.round(ms / 86400000);
}

function computePace(goal, current) {
  const today = todayISO();
  const totalDays = Math.max(1, daysBetween(goal.startDate, goal.deadline));
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(goal.startDate, today)));
  const expected = goal.target * (elapsed / totalDays);
  const daysLeft = daysBetween(today, goal.deadline);
  return { expected, daysLeft, totalDays };
}

function goalStatus(goal, current) {
  const { expected, daysLeft } = computePace(goal, current);
  if (current >= goal.target) return { text: "🎉 Objectif atteint", cls: "status-good" };
  if (daysLeft < 0) return { text: "⏰ Échéance dépassée", cls: "status-bad" };
  if (daysLeft === 0) return { text: "🔥 C'est aujourd'hui", cls: "status-warn" };
  const tolerance = goal.target * 0.03;
  if (current + tolerance >= expected) {
    return current > expected + goal.target * 0.08
      ? { text: "🚀 En avance", cls: "status-good" }
      : { text: "✅ Dans les temps", cls: "status-good" };
  }
  return { text: "⚠️ En retard", cls: "status-warn" };
}

function effortText(goal, current) {
  const { daysLeft } = computePace(goal, current);
  const remaining = Math.max(0, goal.target - current);
  if (remaining <= 0) return "—";
  if (daysLeft <= 0) return `${eurFmt.format(remaining)} maintenant`;
  const months = daysLeft / 30.44;
  const weeks = daysLeft / 7;
  if (months >= 1.5) {
    return `${eurFmt.format(remaining / months)} / mois`;
  }
  return `${eurFmt.format(remaining / Math.max(1, weeks))} / semaine`;
}

/* --------------------------- Taux de change --------------------------- */

function setRateBadge() {
  const badge = document.getElementById("rateBadge");
  const text = document.getElementById("rateBadgeText");
  text.textContent = `1 € ≈ ${Math.round(state.rate.value)} ¥`;
  badge.classList.toggle("is-offline", !state.rate.isLive);
  badge.title = state.rate.isLive
    ? `Taux du ${state.rate.date} (source : Frankfurter API)`
    : "Taux indicatif (dernière valeur connue) — connexion indisponible";
}

async function refreshRate() {
  const cachedToday = state.rate.date === todayISO();
  if (cachedToday) {
    setRateBadge();
    return;
  }
  try {
    const res = await fetch(RATE_API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const value = data && data.rates && data.rates.JPY;
    if (typeof value === "number" && value > 0) {
      state.rate = { value, date: data.date || todayISO(), fetchedAt: Date.now(), isLive: true };
      saveState();
    }
  } catch (e) {
    // Hors-ligne ou API bloquée (ex: aperçu en bac à sable) : on garde la dernière valeur connue.
    state.rate.isLive = false;
  }
  setRateBadge();
  render();
}

/* --------------------------------- Rendu -------------------------------- */

const goalsWrapper = document.getElementById("goalsWrapper");
const template = document.getElementById("goalCardTemplate");
const cardEls = {}; // { japan: <article>, other: <article> }

function buildCards() {
  Object.keys(state.goals).forEach((key) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.goal = key;
    goalsWrapper.appendChild(node);
    cardEls[key] = node;
    wireCard(key, node);
  });
}

function wireCard(key, node) {
  const goal = state.goals[key];
  const labelInput = node.querySelector(".goal-card__label");
  labelInput.value = goal.label;
  labelInput.addEventListener("change", () => {
    goal.label = labelInput.value.trim() || goal.label;
    saveState();
  });

  const targetInput = node.querySelector('[data-role="targetInput"]');
  targetInput.value = goal.target;
  targetInput.addEventListener("change", () => {
    const v = parseFloat(targetInput.value);
    if (v > 0) {
      goal.target = v;
      saveState();
      render();
    } else {
      targetInput.value = goal.target;
    }
  });

  const deadlineInput = node.querySelector('[data-role="deadlineInput"]');
  deadlineInput.value = goal.deadline;
  deadlineInput.addEventListener("change", () => {
    if (deadlineInput.value) {
      goal.deadline = deadlineInput.value;
      saveState();
      render();
    }
  });

  // Toggle dépôt / retrait
  const toggle = node.querySelector('[data-role="txToggle"]');
  const submitBtn = node.querySelector('[data-role="txSubmit"]');
  const noteInput = node.querySelector('[data-role="txNote"]');
  const hint = node.querySelector('[data-role="txHint"]');
  let currentType = "deposit";

  toggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".tx-toggle__btn");
    if (!btn) return;
    currentType = btn.dataset.type;
    toggle.querySelectorAll(".tx-toggle__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    submitBtn.classList.toggle("is-withdrawal", currentType === "withdrawal");
    submitBtn.textContent = currentType === "withdrawal" ? "Ajouter le retrait" : "Ajouter le dépôt";
    noteInput.placeholder =
      currentType === "withdrawal"
        ? "Motif obligatoire (ex: facture imprévue → viré sur le compte courant)"
        : "Motif (optionnel)";
    hint.style.display = currentType === "withdrawal" ? "block" : "none";
  });
  hint.style.display = "none";

  // La validité personnalisée doit être effacée pendant la saisie, sinon le
  // navigateur bloque le prochain "submit" avant même que notre handler ne s'exécute.
  noteInput.addEventListener("input", () => noteInput.setCustomValidity(""));

  // Formulaire d'ajout
  const form = node.querySelector('[data-role="txForm"]');
  const amountInput = node.querySelector('[data-role="txAmount"]');
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);
    if (!(amount > 0)) return;
    const note = noteInput.value.trim();
    if (currentType === "withdrawal" && !note) {
      noteInput.focus();
      noteInput.setCustomValidity("Merci de justifier ce retrait (motif obligatoire).");
      noteInput.reportValidity();
      return;
    }
    noteInput.setCustomValidity("");

    goal.transactions.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      date: todayISO(),
      type: currentType,
      amount,
      note,
    });
    saveState();
    amountInput.value = "";
    noteInput.value = "";
    render();
  });

  // Liste des transactions (délégation pour la suppression)
  const txList = node.querySelector('[data-role="txList"]');
  txList.addEventListener("click", (e) => {
    const btn = e.target.closest(".tx-item__del");
    if (!btn) return;
    const id = btn.dataset.id;
    goal.transactions = goal.transactions.filter((t) => t.id !== id);
    saveState();
    render();
  });
}

function renderCard(key) {
  const node = cardEls[key];
  const goal = state.goals[key];
  const current = goalBalance(goal);
  const rate = state.rate.value;

  node.querySelector(".goal-card__label").value = goal.label;
  node.querySelector('[data-role="targetInput"]').value = goal.target;
  node.querySelector('[data-role="deadlineInput"]').value = goal.deadline;

  node.querySelector('[data-role="currentEur"]').textContent = `${eurFmt.format(Math.max(0, current))} `;
  node.querySelector('[data-role="currentJpy"]').textContent = `≈ ${jpyFmt.format(Math.max(0, current) * rate)} · objectif ≈ ${jpyFmt.format(goal.target * rate)}`;

  const pct = Math.max(0, Math.min(100, (current / goal.target) * 100));
  const bar = node.querySelector('[data-role="progressBar"]');
  bar.style.width = pct + "%";
  bar.classList.toggle("is-complete", current >= goal.target);
  node.querySelector('[data-role="progressPct"]').textContent = Math.round(pct) + "%";
  node.querySelector('[data-role="progressWrap"]').setAttribute("aria-valuenow", Math.round(pct));

  const status = goalStatus(goal, current);
  const statusEl = node.querySelector('[data-role="status"]');
  statusEl.textContent = status.text;
  statusEl.className = "goal-card__status " + status.cls;

  const { daysLeft } = computePace(goal, current);
  node.querySelector('[data-role="daysLeft"]').textContent =
    daysLeft < 0 ? "Dépassée" : daysLeft === 0 ? "Aujourd'hui" : `${daysLeft} j`;

  node.querySelector('[data-role="remaining"]').textContent =
    current >= goal.target ? "0 € 🎉" : eurFmt.format(goal.target - current);

  node.querySelector('[data-role="effort"]').textContent = effortText(goal, current);

  // Historique
  const txList = node.querySelector('[data-role="txList"]');
  const emptyMsg = txList.querySelector('[data-role="txEmpty"]');
  txList.querySelectorAll(".tx-item").forEach((el) => el.remove());

  if (goal.transactions.length === 0) {
    emptyMsg.style.display = "block";
  } else {
    emptyMsg.style.display = "none";
    goal.transactions.forEach((tx) => {
      const item = document.createElement("div");
      item.className = "tx-item";
      const isWithdrawal = tx.type === "withdrawal";
      item.innerHTML = `
        <span class="tx-item__icon">${isWithdrawal ? "🧾" : "💰"}</span>
        <div class="tx-item__body">
          <div class="tx-item__top">
            <span class="tx-item__amount ${isWithdrawal ? "is-negative" : "is-positive"}">
              ${isWithdrawal ? "−" : "+"}${eurFmt.format(tx.amount)}
            </span>
            <span class="tx-item__date">${formatDateFr(tx.date)}</span>
          </div>
          ${tx.note ? `<div class="tx-item__note">${escapeHtml(tx.note)}</div>` : ""}
        </div>
        <button type="button" class="tx-item__del" data-id="${tx.id}" aria-label="Supprimer ce mouvement">✕</button>
      `;
      txList.appendChild(item);
    });
  }
}

function formatDateFr(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderSummary() {
  const rate = state.rate.value;
  let total = 0;
  let targetSum = 0;
  Object.values(state.goals).forEach((goal) => {
    total += Math.max(0, goalBalance(goal));
    targetSum += goal.target;
  });
  document.getElementById("summaryTotalEur").textContent = eurFmt.format(total);
  document.getElementById("summaryTotalJpy").textContent = `≈ ${jpyFmt.format(total * rate)}`;
  document.getElementById("summaryTargetEur").textContent = eurFmt.format(targetSum);
  document.getElementById("summaryTargetJpy").textContent = `≈ ${jpyFmt.format(targetSum * rate)}`;
}

function renderTabs() {
  document.querySelectorAll(".goal-tabs__btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.goal === state.activeTab);
    btn.setAttribute("aria-selected", btn.dataset.goal === state.activeTab ? "true" : "false");
  });
  Object.entries(cardEls).forEach(([key, node]) => {
    node.classList.toggle("is-active", key === state.activeTab);
  });
}

function render() {
  Object.keys(state.goals).forEach(renderCard);
  renderSummary();
  renderTabs();
  setRateBadge();
}

/* --------------------------------- Init --------------------------------- */

buildCards();
render();
refreshRate();

document.getElementById("goalTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".goal-tabs__btn");
  if (!btn) return;
  state.activeTab = btn.dataset.goal;
  saveState();
  renderTabs();
});

// Revérifie le taux si l'appli reste ouverte plusieurs jours / revient au premier plan
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshRate();
});
