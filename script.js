'use strict';

const STORAGE_KEY = 'yearbookQuestVisualNovelV8';
const SETTINGS_KEY = 'yearbookQuestDataSourcesV6';
const OFFICE_SURVEY_URL = 'https://surveymars.com/q/T4GbxhQUK?collect=3';
const EMPLOYABILITY_FORM_URL = 'https://forms.gle/1BjEzA4UJb2Rac2r6';
const RESOLVE_PASSWORD = '0143';

const PAYMENT_REQUIRED_BATCHES = ['2025', '2023', '2022'];
const NO_YEARBOOK_BATCHES = ['2024', '2017', '2016', '2013'];
const NO_PAYMENT_BATCHES = ['2020', '2019', '2018', '2015', '2014', '2012', '2010'];
const CONFIGURED_BATCHES = [...new Set([
  ...PAYMENT_REQUIRED_BATCHES,
  ...NO_YEARBOOK_BATCHES,
  ...NO_PAYMENT_BATCHES
])].sort((a, b) => Number(b) - Number(a));

const DEFAULT_STATE = {
  step: 0,
  firstName: '',
  lastName: '',
  batch: '',
  yearbook: '',
  batchRule: '',
  orNumber: '',
  paidVerified: false,
  paymentLookupStatus: 'idle',
  paymentMessage: '',
  alreadyClaimed: false,
  employabilityCompleted: false,
  employabilityStatus: 'idle',
  employabilityMessage: '',
  surveyOpened: false,
  photo: '',
  dateClaimed: '',
  cameraSkipped: false,
  claimSynced: false,
  claimSyncMessage: '',
  claimedBatches: [],
  claimedRecordCount: 0,
  duplicateClaim: false
};

const DEFAULT_SETTINGS = {
  employabilityWebAppUrl: '',
  paidListWebAppUrl: ''
};

const STEP_META = [
  { label: 'Step: Intro', size: 'intro' },
  { label: 'Step: 1/7 · Name', size: 'name' },
  { label: 'Step: 2/7 · Batch', size: 'batch' },
  { label: 'Step: 3/7 · Yearbook', size: 'yearbook' },
  { label: 'Step: 4/7 · Paid Alumni', size: 'paid' },
  { label: 'Step: 5/7 · Employability', size: 'employability' },
  { label: 'Step: 6/7 · Office Survey', size: 'survey' },
  { label: 'Step: 7/7 · Congrats', size: 'congrats' },
  { label: 'Step: Photo', size: 'photo' },
  { label: 'Step: Claim Record', size: 'summary' }
];

const dialogueShell = document.getElementById('dialogueShell');
const dialogueContent = document.getElementById('dialogueContent');
const dialogueLine = document.getElementById('dialogueLine');
const stepContent = document.getElementById('stepContent');
const stepIndicator = document.getElementById('stepIndicator');
const guideStage = document.getElementById('guideStage');
const voiceToggle = document.getElementById('voiceToggle');
const toast = document.getElementById('toast');
const newClaimTop = document.getElementById('newClaimTop');
const captureCanvas = document.getElementById('captureCanvas');
const surveyModal = document.getElementById('surveyModal');
const surveyFrame = document.getElementById('surveyFrame');
const duplicateClaimModal = document.getElementById('duplicateClaimModal');
const duplicateClaimMessage = document.getElementById('duplicateClaimMessage');
const duplicateClaimBatches = document.getElementById('duplicateClaimBatches');
const cameraModal = document.getElementById('cameraModal');
const resolveModal = document.getElementById('resolveModal');
const resolveForm = document.getElementById('resolveForm');
const resolvePassword = document.getElementById('resolvePassword');
const resolveError = document.getElementById('resolveError');

let state = loadState();
let settings = loadSettings();
let typingTimer = null;
let transitionTimer = null;
let toastTimer = null;
let stream = null;
let renderToken = 0;
let captureCountdownInterval = null;
let captureCountdownValue = 0;
let captureCountdownActive = false;

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === 'object'
      ? { ...cloneDefaultState(), ...parsed }
      : cloneDefaultState();
  } catch (error) {
    console.warn('Could not restore saved claim progress.', error);
    return cloneDefaultState();
  }
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return parsed && typeof parsed === 'object'
      ? { ...DEFAULT_SETTINGS, ...parsed }
      : { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.warn('Could not restore data-source settings.', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not save claim progress.', error);
    showToast('Progress could not be saved. The captured photo may be too large.');
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function updateState(patch, shouldSave = true) {
  state = { ...state, ...patch };
  if (shouldSave) saveState();
}

function updateSettings(patch) {
  settings = { ...settings, ...patch };
  saveSettings();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}


function setSpeakingState() {}
function stopSpeaking() {}
function speakDialogue() {}
function syncVoiceToggle() {}

function normalizePersonName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function displayName() {
  const last = String(state.lastName || '').trim();
  const first = String(state.firstName || '').trim();
  return last && first ? `${last}, ${first}` : first || last;
}


function normalizedClaimedBatches(value) {
  const batches = Array.isArray(value) ? value : [];
  return [...new Set(batches.map((batch) => String(batch || '').trim()).filter(Boolean))]
    .sort((a, b) => {
      const aNumber = Number(a);
      const bNumber = Number(b);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

function claimedStatusText() {
  const batches = normalizedClaimedBatches(state.claimedBatches);
  if (batches.length) return batches.map((batch) => `Claimed ${batch}`).join(', ');
  return state.claimSynced ? `Claimed ${state.batch} ✓` : 'Not synchronized';
}

function claimedBatchChipsHtml() {
  return normalizedClaimedBatches(state.claimedBatches)
    .map((batch) => `<span class="claimed-batch-chip">Claimed ${escapeHtml(batch)}</span>`)
    .join('');
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function batchRuleFor(batch) {
  const value = String(batch || '');
  if (PAYMENT_REQUIRED_BATCHES.includes(value)) return 'payment-required';
  if (NO_PAYMENT_BATCHES.includes(value)) return 'no-payment';
  if (NO_YEARBOOK_BATCHES.includes(value)) return 'no-yearbook';
  return 'unsupported';
}

function yearbookFor(batch) {
  const rule = batchRuleFor(batch);
  if (rule === 'no-yearbook' || rule === 'unsupported') return 'No Yearbook Available';
  return `Yearbook ${batch}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function setDialogue(text, instant = false) {
  clearInterval(typingTimer);
  stopSpeaking();
  dialogueLine.replaceChildren();
  const textNode = document.createTextNode('');
  const cursor = document.createElement('span');
  cursor.className = 'type-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  dialogueLine.append(textNode, cursor);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (instant || reducedMotion) {
    textNode.nodeValue = text;
    speakDialogue(text);
    return;
  }

  speakDialogue(text);
  let index = 0;
  const speed = text.length > 140 ? 18 : 23;
  typingTimer = setInterval(() => {
    textNode.nodeValue += text[index] || '';
    index += 1;
    if (index >= text.length) clearInterval(typingTimer);
  }, speed);
}

function renderStep({ instant = false } = {}) {
  const token = ++renderToken;
  const meta = STEP_META[state.step] || STEP_META[0];
  stepIndicator.textContent = meta.label;
  dialogueShell.dataset.size = meta.size;
  dialogueContent.scrollTop = 0;
  const renderer = STEP_RENDERERS[state.step] || STEP_RENDERERS[0];
  const { line, html, afterRender } = renderer();
  stepContent.innerHTML = html;
  setDialogue(line, instant);

  requestAnimationFrame(() => {
    if (token !== renderToken) return;
    bindCurrentStep();
    if (typeof afterRender === 'function') afterRender();
  });
}

function goTo(step, options = {}) {
  if (step < 0 || step >= STEP_META.length) return;
  clearTimeout(transitionTimer);
  stopSpeaking();
  stopCaptureCountdown();
  stopCamera();
  closeCameraModal({ stopStream: false });
  closeSurveyModal();
  closeResolveModal();
  dialogueShell.classList.add('is-transitioning');
  transitionTimer = setTimeout(() => {
    updateState({ step });
    renderStep(options);
    dialogueShell.classList.remove('is-transitioning');
  }, options.instant ? 0 : 170);
}

function resetClaim() {
  if (state.duplicateClaim) {
    openResolveModal();
    showToast('Authorized password required to restart this duplicate claim.');
    return;
  }
  const confirmed = state.step === 0 || window.confirm(
    'Start a new claim? The current saved claim progress will be cleared. Your Web App URLs will remain saved.'
  );
  if (!confirmed) return;
  restartClaimWorkflow('A new Yearbook Quest has begun.');
}

function restartClaimWorkflow(message = 'Claim workflow restarted.') {
  stopCamera();
  closeCameraModal({ stopStream: false });
  closeSurveyModal();
  closeDuplicateClaimModal();
  closeResolveModal();
  localStorage.removeItem(STORAGE_KEY);
  state = cloneDefaultState();
  goTo(0, { instant: true });
  showToast(message);
}

function validateNamePart(value, label) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) {
    return { valid: false, message: `Please enter the claimant’s ${label}.` };
  }
  return { valid: true, value: cleaned };
}

function sanitizeWebAppUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!/^https:$/.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function endpointSetupHtml({ id, label, value, action, note }) {
  return `
    <details class="endpoint-setup" ${value ? '' : 'open'}>
      <summary>Data Source Setup</summary>
      <div class="endpoint-setup-body">
        <label class="content-label" for="${id}">${escapeHtml(label)}</label>
        <input class="endpoint-input" id="${id}" type="url" inputmode="url" placeholder="Paste the deployed Apps Script /exec URL" value="${escapeHtml(value)}">
        <p class="endpoint-note">${escapeHtml(note)}</p>
        <button class="vn-button secondary small" type="button" data-action="${action}">Save Web App URL</button>
      </div>
    </details>`;
}

function paymentResultHtml() {
  if (state.batchRule === 'no-payment') {
    return `
      <div class="success-card">
        ✅ <strong>No yearbook payment is required for Batch ${escapeHtml(state.batch)}.</strong>
        The payment Continue button is available automatically.
      </div>`;
  }

  const map = {
    idle: '',
    checking: '<div class="info-card">🔎 Searching the Google Sheet…</div>',
    verified: `<div class="success-card">✅ Payment verified for <strong>${escapeHtml(displayName())}</strong>. OR No. ${escapeHtml(state.orNumber)}</div>`,
    claimed: `<div class="failure-card">⚠️ This record is already marked <strong>Claimed</strong>. Please verify the claimant before continuing.</div>`,
    notfound: `<div class="failure-card">⚠️ No exact record matched the Last Name, First Name, batch, and OR number.</div>`,
    error: `<div class="failure-card">⚠️ ${escapeHtml(state.paymentMessage || 'The paid-list sheet could not be checked.')}</div>`
  };
  return map[state.paymentLookupStatus] || '';
}

function employabilityResultHtml() {
  const map = {
    idle: '<div class="info-card">The system will compare the claimant’s first and last names with the survey response sheet.</div>',
    checking: '<div class="info-card">🔎 Checking the Graduate Employability responses…</div>',
    found: `<div class="success-card">✅ Thank you for answering the response, <strong>${escapeHtml(displayName())}</strong>.</div>`,
    notfound: `
      <div class="failure-card">⚠️ The claimant’s name was not found in the Graduate Employability responses.</div>
      <div class="qr-card">
        <img src="assets/graduate-employability-form-qr.png" alt="QR code for the Graduate Employability Form">
        <div>
          <strong>Scan to answer the form</strong>
          <p>After submitting, return here and select “Check Again.”</p>
          <a href="${EMPLOYABILITY_FORM_URL}" target="_blank" rel="noopener noreferrer">Open Graduate Employability Form</a>
        </div>
      </div>`,
    error: `<div class="failure-card">⚠️ ${escapeHtml(state.employabilityMessage || 'The response sheet could not be checked.')}</div>`
  };
  return map[state.employabilityStatus] || map.idle;
}

function fireConfetti() {
  document.querySelector('.confetti-layer')?.remove();
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const colors = ['#f3c329', '#b84b13', '#e96c77', '#54a577', '#7b65ba', '#fff1a5'];
  for (let index = 0; index < 70; index += 1) {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * .65}s`;
    piece.style.animationDuration = `${2.1 + Math.random() * 1.5}s`;
    piece.style.setProperty('--drift', `${-120 + Math.random() * 240}px`);
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4300);
}

function jsonpRequest(baseUrl, params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callbackName = `yearbookQuestCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('The Google Sheet request timed out.'));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('The Google Apps Script Web App could not be reached.'));
    };

    const query = new URLSearchParams({ ...params, callback: callbackName });
    script.src = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query.toString()}`;
    document.head.appendChild(script);
  });
}

const STEP_RENDERERS = [
  () => ({
    line: 'Welcome, dear alumnus! I am Yuna, your Yearbook User Navigation Assistant. Complete each requirement and I will help finalize your claim record.',
    html: '<div class="action-row end"><button class="vn-button" type="button" data-action="begin">Begin Quest ▶</button></div>'
  }),

  () => ({
    line: 'First, enter the claimant’s last name and first name exactly as they appear in the official records.',
    html: `
      <div class="name-grid">
        <div>
          <label class="content-label" for="lastName">Last Name</label>
          <input class="text-input" id="lastName" type="text" autocomplete="family-name" maxlength="60" placeholder="e.g., Rizal" value="${escapeHtml(state.lastName)}">
        </div>
        <div>
          <label class="content-label" for="firstName">First Name</label>
          <input class="text-input" id="firstName" type="text" autocomplete="given-name" maxlength="60" placeholder="e.g., Jose" value="${escapeHtml(state.firstName)}">
        </div>
      </div>
      <p class="field-error" id="nameError" role="alert"></p>
      <div class="action-row end"><button class="vn-button" type="button" data-action="save-name">Continue ▶</button></div>`
  }),

  () => ({
    line: `A pleasure, ${displayName()}. Select the claimant’s graduation batch.`,
    html: `
      <label class="content-label" for="batchSelect">Graduation Batch</label>
      <select class="select-input" id="batchSelect">
        <option value="">— Select a batch year —</option>
        ${CONFIGURED_BATCHES.map((year) => `<option value="${year}" ${year === state.batch ? 'selected' : ''}>Batch ${year}</option>`).join('')}
      </select>
      <p class="field-error" id="batchError" role="alert"></p>
      <div class="batch-legend">
        <span><b>OR required:</b> 2025, 2023, 2022</span>
        <span><b>No payment:</b> 2020, 2019, 2018, 2015, 2014, 2012, 2010</span>
      </div>
      <div class="action-row">
        <button class="vn-button secondary" type="button" data-action="back">◀ Back</button>
        <button class="vn-button" type="button" data-action="save-batch">Continue ▶</button>
      </div>`
  }),

  () => {
    const unavailable = state.batchRule === 'no-yearbook' || state.batchRule === 'unsupported';
    return {
      line: unavailable
        ? `I’m sorry. There is no yearbook available for Batch ${state.batch}, so this claim cannot continue.`
        : `Batch ${state.batch} will claim “${state.yearbook}.” Let us verify its payment rule.`,
      html: `
        <div class="${unavailable ? 'failure-card' : 'yearbook-card'}">
          <div class="content-label">Yearbook to be claimed</div>
          <div class="yearbook-title"><span aria-hidden="true">${unavailable ? '🚫' : '📖'}</span> ${escapeHtml(state.yearbook)}</div>
          ${unavailable ? '<p>This batch is configured as “No Yearbook Available.” Select a different batch to proceed.</p>' : ''}
        </div>
        <div class="action-row">
          <button class="vn-button secondary" type="button" data-action="back">◀ Change Batch</button>
          ${unavailable ? '' : '<button class="vn-button" type="button" data-action="verify-payment">Verify Paid List ▶</button>'}
        </div>`
    };
  },

  () => {
    const requiresPayment = state.batchRule === 'payment-required';
    const continueEnabled = state.batchRule === 'no-payment' || state.paidVerified;
    return {
      line: requiresPayment
        ? `Batch ${state.batch} requires a paid-list match and a valid OR number. I will search the corresponding Google Sheet.`
        : `Batch ${state.batch} does not require yearbook payment. You may continue automatically.`,
      html: `
        ${endpointSetupHtml({
          id: 'paidListUrl',
          label: 'Paid Alumni Google Apps Script Web App URL',
          value: settings.paidListWebAppUrl,
          action: 'save-paid-url',
          note: 'Use the /exec URL from paid-list-code.gs. It creates and searches the batch sheets.'
        })}
        ${requiresPayment ? `
          <div class="lookup-grid">
            <div>
              <label class="content-label" for="orNumber">OR Number</label>
              <input class="text-input" id="orNumber" type="text" maxlength="50" placeholder="Enter the official receipt number" value="${escapeHtml(state.orNumber)}">
            </div>
            <button class="vn-button lookup-button" type="button" data-action="verify-paid-record">Search Paid List</button>
          </div>` : ''}
        <div id="paymentResult">${paymentResultHtml()}</div>
        <p class="field-error" id="paidError" role="alert"></p>
        <div class="action-row">
          <button class="vn-button secondary" type="button" data-action="back">◀ Back</button>
          <button class="vn-button" id="paidContinue" type="button" data-action="paid-continue" ${continueEnabled ? '' : 'disabled'}>Continue ▶</button>
        </div>`
    };
  },

  () => ({
    line: 'Next, I will automatically check whether this claimant answered the Graduate Employability Form.',
    html: `
      ${endpointSetupHtml({
        id: 'employabilityUrl',
        label: 'Graduate Employability Google Apps Script Web App URL',
        value: settings.employabilityWebAppUrl,
        action: 'save-employability-url',
        note: 'Use the /exec URL from the existing Graduate Employability code.gs.'
      })}
      <div id="employabilityResult">${employabilityResultHtml()}</div>
      <div class="action-row">
        <button class="vn-button secondary" type="button" data-action="back">◀ Back</button>
        <div class="fallback-actions">
          <button class="vn-button secondary" type="button" data-action="verify-employability">${state.employabilityStatus === 'notfound' ? 'Check Again' : 'Verify Response'}</button>
          <button class="vn-button" id="employabilityContinue" type="button" data-action="employability-continue" ${state.employabilityCompleted ? '' : 'disabled'}>Continue ▶</button>
        </div>
      </div>`,
    afterRender: () => {
      if (settings.employabilityWebAppUrl && state.employabilityStatus === 'idle') {
        setTimeout(verifyEmployability, 120);
      }
    }
  }),

  () => ({
    line: 'Almost there! Open the Office Survey popup. Once it opens successfully for the first time, Continue will be enabled.',
    html: `
      <div class="survey-launch-card">
        <div class="survey-launch-icon" aria-hidden="true">📝</div>
        <div>
          <strong>Alumni Office Survey</strong>
          <p>The survey page opens inside a vertically scrollable popup window.</p>
        </div>
        <button class="vn-button" type="button" data-action="open-office-survey">Open Survey</button>
      </div>
      <div class="${state.surveyOpened ? 'success-card' : 'info-card'}" id="surveyOpenStatus">
        ${state.surveyOpened
          ? '✅ The Office Survey popup has been opened. Continue is now enabled.'
          : 'Open the survey popup at least once to unlock Continue.'}
      </div>
      <div class="action-row">
        <button class="vn-button secondary" type="button" data-action="back">◀ Back</button>
        <button class="vn-button" id="surveyContinue" type="button" data-action="survey-continue" ${state.surveyOpened ? '' : 'disabled'}>Continue ▶</button>
      </div>`
  }),

  () => ({
    line: `🎉 Yey! You can now claim the yearbook, ${displayName()}! Every eligibility requirement has been cleared.`,
    html: `
      <div class="congrats-card">
        <strong>🎊 Requirements Complete! 🎊</strong>
        <small>Proceed to the claim photo. After the photo is confirmed, the batch sheet Status will automatically become “Claimed.”</small>
      </div>
      <div class="action-row end"><button class="vn-button" type="button" data-action="open-photo">Take Claim Photo 📷</button></div>`,
    afterRender: fireConfetti
  }),

  () => ({
    line: 'One last step. The documentation camera opens in a large popup so the claimant can comfortably check their position before the five-second capture.',
    html: `
      <div class="photo-launch-card">
        <div class="photo-launch-icon" aria-hidden="true">📷</div>
        <div class="photo-launch-copy">
          <strong>${state.photo ? 'Documentation photo captured' : 'Open the documentation camera'}</strong>
          <p>${state.photo
            ? `Photo recorded on ${escapeHtml(formatDate(state.dateClaimed))}. Reopen the camera to review or retake it.`
            : 'The popup provides a large preview and fixed Back, Capture, and Finalize buttons that remain visible without scrolling.'}</p>
        </div>
        <button class="vn-button" type="button" data-action="open-camera-modal">${state.photo ? 'Review Photo' : 'Open Camera'} ▶</button>
      </div>
      ${state.photo ? `<img class="photo-step-preview" src="${state.photo}" alt="Captured claimant holding the yearbook">` : ''}
      ${!settings.paidListWebAppUrl ? '<div class="failure-card compact-card">⚠️ Add the Paid Alumni Web App URL in the Paid Alumni step before finalizing. It is required to write “Claimed” to Google Sheets.</div>' : ''}
      <div class="action-row">
        <button class="vn-button secondary" type="button" data-action="back">◀ Back</button>
        <button class="vn-button" type="button" data-action="open-camera-modal">${state.photo ? 'Reopen Camera' : 'Take Photo'} 📷</button>
      </div>`,
    afterRender: () => {
      setTimeout(openCameraModal, 180);
    }
  }),

  () => ({
    line: state.duplicateClaim
      ? `Warning, ${displayName()}. More than one claimed yearbook record was found. Please verify the records before closing this claim.`
      : `The claim record is complete, ${displayName()}. The Google Sheet status has been updated.`,
    html: `
      <div class="content-label">Final Claim Record</div>
      <div class="summary-area ${state.duplicateClaim ? 'has-duplicate-warning' : ''}">
        <div class="summary-card">
          ${state.photo
            ? `<img class="summary-photo" src="${state.photo}" alt="Claimant holding the required yearbook document">`
            : '<div class="summary-photo no-photo" role="img" aria-label="No photo recorded">No photo recorded</div>'}
          <div class="summary-details">
            <div class="summary-item"><span>Claimant</span><strong>${escapeHtml(displayName())}</strong></div>
            <div class="summary-item"><span>Graduation Batch</span><strong>${escapeHtml(state.batch)}</strong></div>
            <div class="summary-item"><span>Yearbook</span><strong>${escapeHtml(state.yearbook)}</strong></div>
            <div class="summary-item"><span>Payment</span><strong>${state.batchRule === 'no-payment' ? 'Not required ✓' : `Verified · OR ${escapeHtml(state.orNumber)} ✓`}</strong></div>
            <div class="summary-item"><span>Employability Form</span><strong>${state.employabilityCompleted ? 'Response found ✓' : 'Incomplete'}</strong></div>
            <div class="summary-item"><span>Office Survey</span><strong>${state.surveyOpened ? 'Popup opened ✓' : 'Incomplete'}</strong></div>
            <div class="summary-item"><span>Date Claimed</span><strong>${escapeHtml(formatDate(state.dateClaimed))}</strong></div>
            <div class="summary-item">
              <span>Google Sheet Status</span>
              <strong>${escapeHtml(claimedStatusText())}</strong>
              ${state.claimedBatches?.length ? `<div class="claimed-batch-list">${claimedBatchChipsHtml()}</div>` : ''}
            </div>
          </div>
        </div>
        ${state.duplicateClaim ? `
          <aside class="duplicate-warning-card" role="alert">
            <div class="warning-symbol">⚠️</div>
            <strong>User already claimed a yearbook</strong>
            <p>${escapeHtml(displayName())} has ${Number(state.claimedRecordCount || state.claimedBatches.length)} claimed records across the yearbook sheets.</p>
            <p>Please verify the listed batches before allowing another claim to finish.</p>
            <button class="vn-button secondary small" type="button" data-action="show-duplicate-warning">View Warning</button>
          </aside>` : ''}
      </div>
      <div class="action-row finish-actions">
        ${state.duplicateClaim
          ? '<button class="vn-button resolve-button" type="button" data-action="resolve-claim">🔐 Resolve</button>'
          : `<button class="vn-button secondary" type="button" data-action="download-photo" ${state.photo ? '' : 'disabled'}>Download Photo Again</button>`}
        <button class="vn-button" id="finishNewClaimButton" type="button" data-action="finish" ${state.duplicateClaim ? 'disabled aria-describedby="duplicateClaimTitle" title="Use Resolve and enter the authorized password to restart"' : ''}>Finish & New Claim ▶</button>
      </div>`,
    afterRender: () => {
      if (state.duplicateClaim) setTimeout(openDuplicateClaimModal, 220);
    }
  })
];

function bindCurrentStep() {
  stepContent.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', handleAction);
  });

  const lastName = document.getElementById('lastName');
  const firstName = document.getElementById('firstName');
  [lastName, firstName].forEach((input) => {
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') document.querySelector('[data-action="save-name"]')?.click();
    });
  });
  lastName?.focus({ preventScroll: true });

  document.getElementById('batchSelect')?.addEventListener('change', () => {
    document.getElementById('batchError').textContent = '';
  });

  document.getElementById('orNumber')?.addEventListener('input', (event) => {
    updateState({ orNumber: event.target.value, paidVerified: false, paymentLookupStatus: 'idle', alreadyClaimed: false });
    const continueButton = document.getElementById('paidContinue');
    const result = document.getElementById('paymentResult');
    if (continueButton) continueButton.disabled = true;
    if (result) result.innerHTML = paymentResultHtml();
  });

}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;

  switch (action) {
    case 'begin':
      goTo(1);
      break;

    case 'save-name': {
      const lastResult = validateNamePart(document.getElementById('lastName')?.value, 'last name');
      const firstResult = validateNamePart(document.getElementById('firstName')?.value, 'first name');
      const error = document.getElementById('nameError');

      if (!lastResult.valid || !firstResult.valid) {
        error.textContent = !lastResult.valid ? lastResult.message : firstResult.message;
        (!lastResult.valid ? document.getElementById('lastName') : document.getElementById('firstName'))?.focus();
        return;
      }

      updateState({
        firstName: firstResult.value,
        lastName: lastResult.value,
        batch: '',
        yearbook: '',
        batchRule: '',
        orNumber: '',
        paidVerified: false,
        paymentLookupStatus: 'idle',
        alreadyClaimed: false,
        employabilityCompleted: false,
        employabilityStatus: 'idle',
        surveyOpened: false,
        photo: '',
        dateClaimed: '',
        cameraSkipped: false,
        claimSynced: false,
        claimSyncMessage: '',
        claimedBatches: [],
        claimedRecordCount: 0,
        duplicateClaim: false
      });
      goTo(2);
      break;
    }

    case 'save-batch': {
      const select = document.getElementById('batchSelect');
      if (!select?.value) {
        document.getElementById('batchError').textContent = 'Please select a graduation batch.';
        select?.focus();
        return;
      }
      const rule = batchRuleFor(select.value);
      updateState({
        batch: select.value,
        yearbook: yearbookFor(select.value),
        batchRule: rule,
        orNumber: '',
        paidVerified: rule === 'no-payment',
        paymentLookupStatus: rule === 'no-payment' ? 'verified' : 'idle',
        paymentMessage: '',
        alreadyClaimed: false,
        employabilityCompleted: false,
        employabilityStatus: 'idle',
        surveyOpened: false,
        photo: '',
        dateClaimed: '',
        cameraSkipped: false,
        claimSynced: false,
        claimSyncMessage: '',
        claimedBatches: [],
        claimedRecordCount: 0,
        duplicateClaim: false
      });
      goTo(3);
      break;
    }

    case 'verify-payment':
      goTo(4);
      break;

    case 'save-paid-url': {
      const url = sanitizeWebAppUrl(document.getElementById('paidListUrl')?.value);
      if (!url) {
        document.getElementById('paidError').textContent = 'Enter a valid HTTPS Apps Script Web App URL.';
        return;
      }
      updateSettings({ paidListWebAppUrl: url });
      showToast('Paid Alumni Web App URL saved.');
      renderStep({ instant: true });
      break;
    }

    case 'verify-paid-record':
      await verifyPaidRecord(event.currentTarget);
      break;

    case 'paid-continue':
      if (state.batchRule === 'no-payment' || state.paidVerified) goTo(5);
      break;

    case 'save-employability-url': {
      const url = sanitizeWebAppUrl(document.getElementById('employabilityUrl')?.value);
      if (!url) {
        showToast('Enter a valid HTTPS Apps Script Web App URL.');
        return;
      }
      updateSettings({ employabilityWebAppUrl: url });
      updateState({ employabilityStatus: 'idle', employabilityCompleted: false });
      showToast('Graduate Employability Web App URL saved.');
      renderStep({ instant: true });
      break;
    }

    case 'verify-employability':
      await verifyEmployability();
      break;

    case 'employability-continue':
      if (state.employabilityCompleted) goTo(6);
      break;

    case 'open-office-survey':
      openSurveyModal();
      break;

    case 'survey-continue':
      if (state.surveyOpened) goTo(7);
      break;

    case 'open-photo':
      goTo(8);
      break;

    case 'open-camera-modal':
      openCameraModal();
      break;

    case 'camera-back':
      closeCameraModal();
      goTo(7);
      break;

    case 'camera-capture':
      await startCameraModalCountdown(event.currentTarget);
      break;

    case 'manual-fallback':
      stopCaptureCountdown();
      updateState({ cameraSkipped: true, dateClaimed: state.dateClaimed || todayISO(), claimSynced: false });
      revealManualFallback();
      break;

    case 'camera-finalize':
      await finalizeClaimRecord(event.currentTarget);
      break;

    case 'download-photo':
      if (state.photo) downloadClaimPhoto(state.photo);
      break;

    case 'show-duplicate-warning':
      openDuplicateClaimModal();
      break;

    case 'resolve-claim':
      closeDuplicateClaimModal();
      openResolveModal();
      break;

    case 'cancel-resolve':
      closeResolveModal();
      break;

    case 'finish':
      if (state.duplicateClaim) {
        openDuplicateClaimModal();
        showToast('Finish is disabled because multiple claimed records were detected.');
        return;
      }
      if (!state.claimSynced) {
        showToast('The claim must be synchronized to Google Sheets before it can be closed.');
        return;
      }
      stopCamera();
      localStorage.removeItem(STORAGE_KEY);
      state = cloneDefaultState();
      goTo(0, { instant: true });
      showToast('Claim completed. Ready for the next alumnus.');
      break;

    case 'back':
      goTo(Math.max(0, state.step - 1));
      break;

    default:
      break;
  }
}

async function verifyPaidRecord(button) {
  const error = document.getElementById('paidError');
  const enteredUrl = sanitizeWebAppUrl(document.getElementById('paidListUrl')?.value);
  if (enteredUrl && enteredUrl !== settings.paidListWebAppUrl) updateSettings({ paidListWebAppUrl: enteredUrl });

  if (!settings.paidListWebAppUrl) {
    error.textContent = 'Save the Paid Alumni Apps Script Web App URL first.';
    return;
  }

  const orNumber = String(document.getElementById('orNumber')?.value || '').trim();
  if (!orNumber) {
    error.textContent = `OR number is required for Batch ${state.batch}.`;
    document.getElementById('orNumber')?.focus();
    return;
  }

  error.textContent = '';
  button.disabled = true;
  button.textContent = 'Searching…';
  updateState({ orNumber, paymentLookupStatus: 'checking', paidVerified: false, alreadyClaimed: false });
  document.getElementById('paymentResult').innerHTML = paymentResultHtml();

  try {
    const payload = await jsonpRequest(settings.paidListWebAppUrl, {
      action: 'checkPaidAlumni',
      batch: state.batch,
      firstName: state.firstName,
      lastName: state.lastName,
      orNumber
    });

    if (!payload?.success) throw new Error(payload?.message || 'Paid-list lookup failed.');

    const alreadyClaimed = Boolean(payload.alreadyClaimed);
    const verified = Boolean(payload.eligible) && !alreadyClaimed;
    updateState({
      paidVerified: verified,
      alreadyClaimed,
      paymentLookupStatus: alreadyClaimed ? 'claimed' : verified ? 'verified' : 'notfound',
      paymentMessage: payload.message || ''
    });
  } catch (errorValue) {
    updateState({
      paidVerified: false,
      alreadyClaimed: false,
      paymentLookupStatus: 'error',
      paymentMessage: errorValue.message
    });
  }

  renderStep({ instant: true });
}

async function verifyEmployability() {
  const enteredUrl = sanitizeWebAppUrl(document.getElementById('employabilityUrl')?.value);
  if (enteredUrl && enteredUrl !== settings.employabilityWebAppUrl) updateSettings({ employabilityWebAppUrl: enteredUrl });

  if (!settings.employabilityWebAppUrl) {
    showToast('Save the Graduate Employability Apps Script Web App URL first.');
    return;
  }

  updateState({ employabilityStatus: 'checking', employabilityCompleted: false, employabilityMessage: '' });
  renderStep({ instant: true });

  try {
    const payload = await jsonpRequest(settings.employabilityWebAppUrl, {
      action: 'checkName',
      firstName: state.firstName,
      lastName: state.lastName
    });

    if (!payload?.success) throw new Error(payload?.message || 'Graduate Employability lookup failed.');
    updateState({
      employabilityCompleted: Boolean(payload.found),
      employabilityStatus: payload.found ? 'found' : 'notfound',
      employabilityMessage: payload.message || ''
    });
  } catch (error) {
    updateState({
      employabilityCompleted: false,
      employabilityStatus: 'error',
      employabilityMessage: error.message
    });
  }

  renderStep({ instant: true });
}

function openSurveyModal() {
  if (!surveyModal || !surveyFrame) return;
  if (surveyFrame.src === 'about:blank') surveyFrame.src = OFFICE_SURVEY_URL;
  surveyModal.hidden = false;
  document.body.classList.add('modal-open');

  requestAnimationFrame(() => {
    surveyModal.classList.add('is-open');
    updateState({ surveyOpened: true });
    const continueButton = document.getElementById('surveyContinue');
    const status = document.getElementById('surveyOpenStatus');
    if (continueButton) continueButton.disabled = false;
    if (status) {
      status.className = 'success-card';
      status.innerHTML = '✅ The Office Survey popup has been opened. Continue is now enabled.';
    }
    surveyModal.querySelector('.survey-modal-close')?.focus();
  });
}

function closeSurveyModal() {
  if (!surveyModal || surveyModal.hidden) return;
  surveyModal.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  setTimeout(() => {
    surveyModal.hidden = true;
  }, 160);
}

function syncBodyModalState() {
  const anyOpen = [surveyModal, cameraModal, duplicateClaimModal, resolveModal]
    .some((modal) => modal && !modal.hidden);
  document.body.classList.toggle('modal-open', anyOpen);
}

function syncCameraModalFromState() {
  const video = document.getElementById('cameraVideo');
  const image = document.getElementById('capturedImage');
  const placeholder = document.getElementById('cameraPlaceholder');
  const status = document.getElementById('cameraStatus');
  const captureButton = document.getElementById('captureButton');
  const finalizeButton = document.getElementById('photoContinue');
  const error = document.getElementById('cameraError');
  const manualDate = document.getElementById('manualDate');
  if (error) error.textContent = state.claimSyncMessage || '';
  if (manualDate) manualDate.value = state.dateClaimed || todayISO();
  if (state.photo) {
    if (image) { image.src = state.photo; image.hidden = false; }
    if (video) video.hidden = true;
    if (placeholder) placeholder.hidden = true;
    if (status) { status.textContent = `Photo captured · ${formatDate(state.dateClaimed)}`; status.className = 'camera-status success'; }
    if (captureButton) { captureButton.disabled = false; captureButton.textContent = '📷 Retake in 5 Seconds'; }
    if (finalizeButton) finalizeButton.disabled = false;
  } else {
    if (image) { image.hidden = true; image.removeAttribute('src'); }
    if (video) video.hidden = false;
    if (placeholder) placeholder.hidden = false;
    if (captureButton) { captureButton.disabled = true; captureButton.textContent = '📷 Capture in 5 Seconds'; }
    if (finalizeButton) finalizeButton.disabled = !state.cameraSkipped;
  }
}

function openCameraModal() {
  if (!cameraModal || state.step !== 8) return;
  cameraModal.hidden = false;
  syncBodyModalState();
  syncCameraModalFromState();
  requestAnimationFrame(() => cameraModal.classList.add('is-open'));
  if (!state.photo && !state.cameraSkipped) startCamera();
}

function closeCameraModal({ stopStream = true } = {}) {
  if (!cameraModal || cameraModal.hidden) {
    if (stopStream) stopCamera();
    return;
  }
  cameraModal.classList.remove('is-open');
  if (stopStream) stopCamera();
  setTimeout(() => { cameraModal.hidden = true; syncBodyModalState(); }, 170);
}

function waitForVideoReady(video, timeoutMs = 2500) {
  if (video?.videoWidth && video?.videoHeight) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video?.removeEventListener('loadedmetadata', onReady);
      video?.removeEventListener('canplay', onReady);
      resolve(value);
    };
    const onReady = () => finish(Boolean(video?.videoWidth && video?.videoHeight));
    const timer = setTimeout(() => finish(Boolean(video?.videoWidth && video?.videoHeight)), timeoutMs);
    video?.addEventListener('loadedmetadata', onReady, { once: true });
    video?.addEventListener('canplay', onReady, { once: true });
  });
}

async function startCameraModalCountdown(button) {
  const error = document.getElementById('cameraError');
  if (error) error.textContent = '';
  if (!stream) await startCamera();
  const video = document.getElementById('cameraVideo');
  const image = document.getElementById('capturedImage');
  if (video) video.hidden = false;
  if (image) image.hidden = true;
  const videoReady = await waitForVideoReady(video);
  if (!stream || !videoReady || !video?.videoWidth || !video?.videoHeight) {
    if (error) error.textContent = 'The camera is not ready yet. Please wait a moment and click Capture again.';
    return;
  }
  startCaptureCountdown(button);
}

function updateCaptureCountdownUI(value = 0) {
  const countdown = document.getElementById('cameraCountdown');
  const status = document.getElementById('cameraStatus');
  const captureButton = document.getElementById('captureButton');

  if (countdown) {
    countdown.hidden = value <= 0;
    countdown.textContent = String(Math.max(1, value));
  }

  if (status) {
    if (state.photo) {
      status.textContent = 'Photo captured';
      status.className = 'camera-status success';
    } else if (value > 0) {
      status.textContent = `Capturing in ${value} second${value === 1 ? '' : 's'}…`;
      status.className = 'camera-status warn';
    } else {
      status.textContent = 'Camera ready — click Capture';
      status.className = 'camera-status info';
    }
  }

  if (captureButton) {
    captureButton.disabled = captureCountdownActive || !stream;
    captureButton.textContent = value > 0
      ? `📷 Capturing in ${value}…`
      : '📷 Capture in 5 Seconds';
  }
}

function stopCaptureCountdown({ restoreUI = false } = {}) {
  clearInterval(captureCountdownInterval);
  captureCountdownInterval = null;
  captureCountdownValue = 0;
  captureCountdownActive = false;
  if (restoreUI) updateCaptureCountdownUI(0);
}

function startCaptureCountdown(button) {
  const video = document.getElementById('cameraVideo');
  const error = document.getElementById('cameraError');

  if (captureCountdownActive) return;
  if (!video || !video.videoWidth || !video.videoHeight || !stream) {
    if (error) error.textContent = 'The camera is not ready yet. Please wait a moment and try again.';
    return;
  }

  if (error) error.textContent = '';
  captureCountdownActive = true;
  captureCountdownValue = 5;
  if (button) button.disabled = true;
  updateCaptureCountdownUI(captureCountdownValue);

  captureCountdownInterval = setInterval(() => {
    captureCountdownValue -= 1;
    if (captureCountdownValue <= 0) {
      clearInterval(captureCountdownInterval);
      captureCountdownInterval = null;
      captureCountdownActive = false;
      capturePhoto();
      return;
    }
    updateCaptureCountdownUI(captureCountdownValue);
  }, 1000);
}

async function startCamera() {
  const video = document.getElementById('cameraVideo');
  const placeholder = document.getElementById('cameraPlaceholder');
  const status = document.getElementById('cameraStatus');
  const error = document.getElementById('cameraError');
  const fallback = document.getElementById('cameraFallback');
  const captureButton = document.getElementById('captureButton');
  if (!video || state.step !== 8) return false;
  stopCamera();

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showCameraFallback('Camera access requires HTTPS or localhost. Use the upload or manual fallback below.');
    return false;
  }

  try {
    status.textContent = 'Requesting permission…';
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    if (state.step !== 8) {
      stopCamera();
      return;
    }

    video.srcObject = stream;
    video.hidden = false;
    const capturedImage = document.getElementById('capturedImage');
    if (capturedImage) capturedImage.hidden = true;
    placeholder.hidden = true;
    fallback.hidden = true;
    error.textContent = '';
    updateCaptureCountdownUI(0);
    return true;
  } catch (cameraError) {
    console.warn('Camera permission or startup failed.', cameraError);
    showCameraFallback('Camera permission was denied or no usable camera was found.');
    return false;
  }
}

function stopCamera() {
  stopCaptureCountdown();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

function showCameraFallback(message) {
  stopCamera();
  const fallback = document.getElementById('cameraFallback');
  const placeholder = document.getElementById('cameraPlaceholder');
  const status = document.getElementById('cameraStatus');
  const error = document.getElementById('cameraError');
  const captureButton = document.getElementById('captureButton');
  if (fallback) fallback.hidden = false;
  if (placeholder) placeholder.hidden = false;
  if (status) status.textContent = 'Camera unavailable';
  if (error) error.textContent = message;
  if (captureButton) captureButton.disabled = true;
}

function revealManualFallback() {
  const fallback = document.getElementById('cameraFallback');
  const wrap = document.getElementById('manualDateWrap');
  const continueButton = document.getElementById('photoContinue');
  const manualDate = document.getElementById('manualDate');
  if (fallback) fallback.hidden = false;
  if (wrap) wrap.hidden = false;
  if (manualDate) manualDate.value = state.dateClaimed || todayISO();
  if (continueButton) continueButton.disabled = false;
}

function compressImage(source, sourceWidth, sourceHeight) {
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / sourceWidth);
  captureCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
  captureCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = captureCanvas.getContext('2d');
  context.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  context.drawImage(source, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL('image/jpeg', .78);
}

function capturePhoto() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.videoWidth || !video.videoHeight) {
    showCameraFallback('The camera is not ready yet. Try again or use the fallback options.');
    return;
  }
  const photo = compressImage(video, video.videoWidth, video.videoHeight);
  updateState({ photo, dateClaimed: todayISO(), cameraSkipped: false, claimSynced: false, claimSyncMessage: '' });
  stopCamera();
  downloadClaimPhoto(photo);
  syncCameraModalFromState();
  showToast(`Photo captured. Date claimed: ${formatDate(state.dateClaimed)}.`);
}

function handlePhotoUpload(event) {
  stopCaptureCountdown();
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file.');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => showToast('The selected image could not be read.');
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => showToast('The selected image is invalid.');
    image.onload = () => {
      const photo = compressImage(image, image.naturalWidth, image.naturalHeight);
      updateState({ photo, dateClaimed: todayISO(), cameraSkipped: false, claimSynced: false, claimSyncMessage: '' });
      stopCamera();
      downloadClaimPhoto(photo);
      syncCameraModalFromState();
      showToast('Uploaded photo saved and downloaded.');
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function claimPhotoFilename() {
  const date = state.dateClaimed || todayISO();
  const [year, month, day] = date.split('-');
  const cleanLast = String(state.lastName || 'Lastname').replace(/[<>:"/\\|?*]/g, '').trim();
  const cleanFirst = String(state.firstName || 'Firstname').replace(/[<>:"/\\|?*]/g, '').trim();
  return `${Number(month)}-${Number(day)}-${year}-${state.batch}-${cleanLast}, ${cleanFirst}.jpg`;
}

function downloadClaimPhoto(dataUrl) {
  if (!dataUrl) return;
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = claimPhotoFilename();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function requirementsAreComplete() {
  return Boolean(
    state.firstName &&
    state.lastName &&
    state.batch &&
    state.batchRule !== 'no-yearbook' &&
    (state.batchRule === 'no-payment' || state.paidVerified) &&
    state.employabilityCompleted &&
    state.surveyOpened &&
    state.dateClaimed &&
    (state.photo || state.cameraSkipped)
  );
}

async function finalizeClaimRecord(button) {
  if (state.cameraSkipped && !state.photo) {
    const dateInput = document.getElementById('manualDate');
    updateState({ dateClaimed: dateInput?.value || todayISO() });
  }
  if (!state.dateClaimed) updateState({ dateClaimed: todayISO() });

  if (!requirementsAreComplete()) {
    document.getElementById('cameraError').textContent = 'One or more claim requirements are still incomplete.';
    return;
  }

  if (!settings.paidListWebAppUrl) {
    document.getElementById('cameraError').textContent = 'The Paid Alumni Web App URL is required to mark this record as Claimed. Return to the Paid Alumni step and save the URL.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving Claimed Status…';
  updateState({ claimSyncMessage: '' });

  try {
    const payload = await jsonpRequest(settings.paidListWebAppUrl, {
      action: 'markClaimed',
      batch: state.batch,
      firstName: state.firstName,
      lastName: state.lastName,
      orNumber: state.orNumber,
      dateClaimed: state.dateClaimed
    }, 20000);

    if (!payload?.success) throw new Error(payload?.message || 'The claim status could not be saved.');
    const claimedBatches = normalizedClaimedBatches(payload.claimedBatches || [state.batch]);
    const claimedRecordCount = Number(payload.claimedRecordCount || claimedBatches.length);
    const duplicateClaim = Boolean(payload.duplicateClaim || claimedRecordCount > 1 || claimedBatches.length > 1);
    updateState({
      claimSynced: true,
      claimSyncMessage: '',
      claimedBatches,
      claimedRecordCount,
      duplicateClaim
    });
    goTo(9);
  } catch (error) {
    updateState({ claimSynced: false, claimSyncMessage: error.message });
    const errorElement = document.getElementById('cameraError');
    if (errorElement) errorElement.textContent = error.message;
    if (button) { button.disabled = false; button.textContent = 'Finalize Claim ▶'; }
    showToast(error.message);
  }
}


function openResolveModal() {
  if (!resolveModal) return;
  if (duplicateClaimModal && !duplicateClaimModal.hidden) closeDuplicateClaimModal();
  resolveModal.hidden = false;
  if (resolvePassword) resolvePassword.value = '';
  if (resolveError) resolveError.textContent = '';
  syncBodyModalState();
  requestAnimationFrame(() => { resolveModal.classList.add('is-open'); resolvePassword?.focus(); });
}

function closeResolveModal() {
  if (!resolveModal || resolveModal.hidden) return;
  resolveModal.classList.remove('is-open');
  setTimeout(() => {
    resolveModal.hidden = true;
    if (resolvePassword) resolvePassword.value = '';
    if (resolveError) resolveError.textContent = '';
    syncBodyModalState();
  }, 170);
}

function submitResolvePassword(event) {
  event?.preventDefault();
  const entered = String(resolvePassword?.value || '');
  if (entered !== RESOLVE_PASSWORD) {
    if (resolveError) resolveError.textContent = 'Incorrect password. The duplicate claim was not cleared.';
    resolvePassword?.select();
    return;
  }
  restartClaimWorkflow('Duplicate claim resolution authorized. Requirements restarted.');
}

function openDuplicateClaimModal() {
  if (!duplicateClaimModal || !state.duplicateClaim) return;
  const batches = normalizedClaimedBatches(state.claimedBatches);
  if (duplicateClaimMessage) {
    duplicateClaimMessage.textContent = `${displayName()} has ${Number(state.claimedRecordCount || batches.length)} claimed records in the Google Sheets.`;
  }
  if (duplicateClaimBatches) {
    duplicateClaimBatches.innerHTML = batches.length
      ? batches.map((batch) => `<span class="claimed-batch-chip">Claimed ${escapeHtml(batch)}</span>`).join('')
      : '<span class="claimed-batch-chip">Multiple claimed records detected</span>';
  }
  duplicateClaimModal.hidden = false;
  syncBodyModalState();
  requestAnimationFrame(() => duplicateClaimModal.classList.add('is-open'));
}

function closeDuplicateClaimModal() {
  if (!duplicateClaimModal || duplicateClaimModal.hidden) return;
  duplicateClaimModal.classList.remove('is-open');
  setTimeout(() => { duplicateClaimModal.hidden = true; syncBodyModalState(); }, 170);
}

cameraModal?.querySelectorAll('[data-action]').forEach((element) => {
  element.addEventListener('click', handleAction);
});
document.getElementById('photoUpload')?.addEventListener('change', handlePhotoUpload);
resolveModal?.querySelectorAll('[data-action]').forEach((element) => {
  element.addEventListener('click', handleAction);
});
resolveForm?.addEventListener('submit', submitResolvePassword);

surveyModal.querySelectorAll('[data-action="close-survey-modal"]').forEach((element) => {
  element.addEventListener('click', closeSurveyModal);
});

duplicateClaimModal?.querySelectorAll('[data-action="close-duplicate-modal"]').forEach((element) => {
  element.addEventListener('click', closeDuplicateClaimModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !surveyModal.hidden) closeSurveyModal();
  if (event.key === 'Escape' && duplicateClaimModal && !duplicateClaimModal.hidden) closeDuplicateClaimModal();
  if (event.key === 'Escape' && cameraModal && !cameraModal.hidden) { closeCameraModal(); goTo(7); }
  if (event.key === 'Escape' && resolveModal && !resolveModal.hidden) closeResolveModal();
});

newClaimTop.addEventListener('click', resetClaim);
window.addEventListener('beforeunload', () => { stopCamera(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.step === 8) stopCamera();
});

renderStep({ instant: state.step !== 0 });
