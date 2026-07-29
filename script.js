'use strict';

const STORAGE_KEY = 'yearbookQuestVisualNovelV8';
const SETTINGS_KEY = 'yearbookQuestDataSourcesV8';
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
  paidListWebAppUrl: '',
  schemaVersion: 1,
  updatedAt: 0
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
    const savedValue = [
      SETTINGS_KEY,
      'yearbookQuestDataSourcesV7',
      'yearbookQuestDataSourcesV6',
      'yearbookQuestDataSourcesV5',
      'yearbookQuestDataSourcesV4',
      'yearbookQuestDataSourcesV3'
    ].map((key) => localStorage.getItem(key)).find(Boolean);
    const parsed = JSON.parse(savedValue || 'null');
    const restored = parsed && typeof parsed === 'object'
      ? { ...DEFAULT_SETTINGS, ...parsed }
      : { ...DEFAULT_SETTINGS };

    restored.employabilityWebAppUrl = sanitizeWebAppUrl(restored.employabilityWebAppUrl);
    restored.paidListWebAppUrl = sanitizeWebAppUrl(restored.paidListWebAppUrl);
    return restored;
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
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not save endpoint settings in localStorage.', error);
  }
  persistSettingsToPrivateLocalFile(settings).catch((error) => {
    console.warn('Could not save the private local endpoint file.', error);
  });
}

function updateState(patch, shouldSave = true) {
  state = { ...state, ...patch };
  if (shouldSave) saveState();
}

function updateSettings(patch) {
  settings = {
    ...settings,
    ...patch,
    schemaVersion: 1,
    updatedAt: Date.now()
  };
  saveSettings();
}

async function persistSettingsToPrivateLocalFile(value) {
  if (!navigator.storage?.getDirectory) return false;
  const directory = await navigator.storage.getDirectory();
  const handle = await directory.getFileHandle('yearbook-quest-data-sources.json', { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify({
    app: 'Yearbook Quest',
    type: 'data-source-settings',
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    employabilityWebAppUrl: sanitizeWebAppUrl(value.employabilityWebAppUrl),
    paidListWebAppUrl: sanitizeWebAppUrl(value.paidListWebAppUrl),
    updatedAt: Number(value.updatedAt || Date.now())
  }, null, 2));
  await writable.close();
  return true;
}

async function readSettingsFromPrivateLocalFile() {
  if (!navigator.storage?.getDirectory) return null;
  try {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle('yearbook-quest-data-sources.json');
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  } catch (error) {
    if (error?.name !== 'NotFoundError') console.warn('Could not read the private endpoint file.', error);
    return null;
  }
}

async function restoreSettingsFromPrivateLocalFile() {
  const stored = await readSettingsFromPrivateLocalFile();
  if (!stored || typeof stored !== 'object') return false;

  const restored = {
    employabilityWebAppUrl: sanitizeWebAppUrl(stored.employabilityWebAppUrl),
    paidListWebAppUrl: sanitizeWebAppUrl(stored.paidListWebAppUrl),
    schemaVersion: 1,
    updatedAt: Number(stored.updatedAt || 0)
  };

  const hasUsefulValue = restored.employabilityWebAppUrl || restored.paidListWebAppUrl;
  const isNewer = restored.updatedAt > Number(settings.updatedAt || 0);
  const localIsEmpty = !settings.employabilityWebAppUrl && !settings.paidListWebAppUrl;
  if (!hasUsefulValue || (!isNewer && !localIsEmpty)) return false;

  settings = { ...settings, ...restored };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) {}
  renderStep({ instant: true });
  showToast('Saved Google Apps Script links were restored from this device.');
  return true;
}

function endpointSettingsPayload() {
  return {
    app: 'Yearbook Quest',
    type: 'data-source-settings',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    employabilityWebAppUrl: sanitizeWebAppUrl(settings.employabilityWebAppUrl),
    paidListWebAppUrl: sanitizeWebAppUrl(settings.paidListWebAppUrl),
    updatedAt: Date.now()
  };
}

async function exportEndpointSettings() {
  const payload = endpointSettingsPayload();
  const content = JSON.stringify(payload, null, 2);
  const filename = 'yearbook-quest-data-sources.json';

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON settings file', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      showToast('Google Apps Script links saved to the selected local folder.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('Native file save failed; using download fallback.', error);
    }
  }

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Google Apps Script links downloaded as a local settings file.');
}

async function importEndpointSettingsFile(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object') throw new Error('The selected file is not a valid settings file.');

    const employabilityWebAppUrl = sanitizeWebAppUrl(parsed.employabilityWebAppUrl);
    const paidListWebAppUrl = sanitizeWebAppUrl(parsed.paidListWebAppUrl);
    if (!employabilityWebAppUrl && !paidListWebAppUrl) {
      throw new Error('The settings file does not contain a valid Apps Script /exec URL.');
    }

    updateSettings({ employabilityWebAppUrl, paidListWebAppUrl });
    renderStep({ instant: true });
    showToast('Google Apps Script links restored from the local settings file.');
  } catch (error) {
    showToast(error.message || 'The settings file could not be imported.');
  }
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

function inspectAppsScriptWebAppUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return { valid: false, url: '', message: 'Paste the Apps Script Web App URL.' };

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      return { valid: false, url: '', message: 'The Web App URL must use HTTPS.' };
    }

    if (parsed.hostname === 'script.googleusercontent.com') {
      return {
        valid: false,
        url: '',
        message: 'This is Google’s temporary redirected URL. Copy the original URL from Deploy > Manage deployments; it must begin with script.google.com and end in /exec.'
      };
    }

    if (parsed.hostname !== 'script.google.com') {
      return {
        valid: false,
        url: '',
        message: 'Use the original Google Apps Script Web App URL from script.google.com.'
      };
    }

    const path = parsed.pathname.replace(/\/+$/, '');
    const match = path.match(/^\/(?:a\/[^/]+\/)?macros\/s\/([^/]+)\/(exec|dev)$/i);
    if (!match) {
      return {
        valid: false,
        url: '',
        message: 'The URL must be a deployed Apps Script Web App URL ending in /exec.'
      };
    }

    const normalizedPath = path.replace(/\/dev$/i, '/exec');
    const normalized = `${parsed.origin}${normalizedPath}`;
    return {
      valid: true,
      url: normalized,
      correctedFromDev: /\/dev$/i.test(path),
      message: /\/dev$/i.test(path)
        ? 'The test /dev URL was changed to the public /exec URL.'
        : ''
    };
  } catch (error) {
    return { valid: false, url: '', message: 'Enter a valid Google Apps Script Web App URL.' };
  }
}

function sanitizeWebAppUrl(value) {
  const result = inspectAppsScriptWebAppUrl(value);
  return result.valid ? result.url : '';
}

function endpointSetupHtml({ id, label, value, action, testAction = '', statusId = '', note }) {
  return `
    <details class="endpoint-setup" ${value ? '' : 'open'}>
      <summary>Data Source Setup</summary>
      <div class="endpoint-setup-body">
        <label class="content-label" for="${id}">${escapeHtml(label)}</label>
        <input class="endpoint-input" id="${id}" type="url" inputmode="url" placeholder="Paste the deployed Apps Script /exec URL" value="${escapeHtml(value)}">
        <p class="endpoint-note">${escapeHtml(note)}</p>
        <div class="endpoint-button-row">
          <button class="vn-button secondary small" type="button" data-action="${action}">Save Web App URL</button>
          ${testAction ? `<button class="vn-button secondary small" type="button" data-action="${testAction}">Test on This Device</button>` : ''}
        </div>
        <div class="endpoint-backup-row">
          <button class="endpoint-backup-button" type="button" data-action="export-endpoints">💾 Save Links to Local File</button>
          <label class="endpoint-backup-button">📂 Restore Links from File
            <input class="endpoint-settings-import" type="file" accept="application/json,.json">
          </label>
        </div>
        <p class="endpoint-local-note">The links are saved automatically inside this installed app. Use the local file buttons to keep a portable backup.</p>
        ${statusId ? `<p class="endpoint-connection-status" id="${statusId}" aria-live="polite"></p>` : ''}
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

function jsonpRequest(baseUrl, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      reject(new Error('This device is offline. Connect to the internet and try again.'));
      return;
    }

    const inspected = inspectAppsScriptWebAppUrl(baseUrl);
    if (!inspected.valid) {
      reject(new Error(inspected.message));
      return;
    }

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
      reject(new Error('The Google Apps Script request timed out on this device. Confirm internet access, use the original /exec URL, and deploy the Web App with access set to Anyone.'));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(payload);
    };

    script.async = true;
    script.charset = 'utf-8';
    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('This phone could not load the Apps Script endpoint. Use the original script.google.com URL ending in /exec, then deploy it as Execute as: Me and Who has access: Anyone. Do not paste a /dev or script.googleusercontent.com URL.'));
    };

    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
      _questDeviceTime: String(Date.now())
    });
    script.src = `${inspected.url}?${query.toString()}`;
    document.head.appendChild(script);
  });
}


function isInstalledMobileApp() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

function appsScriptIframeBridgeRequest(baseUrl, params, timeoutMs = 26000) {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      reject(new Error('This device is offline. Connect to the internet and try again.'));
      return;
    }

    const inspected = inspectAppsScriptWebAppUrl(baseUrl);
    if (!inspected.valid) {
      reject(new Error(inspected.message));
      return;
    }

    const requestId = `questBridge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement('iframe');
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      iframe.remove();
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('The Graduate Employability mobile bridge timed out. Redeploy code.gs as a new Web App version with access set to Anyone, then reopen or update the installed app.'));
    }, timeoutMs);

    const handleMessage = (event) => {
      const data = event.data;
      if (!data || data.source !== 'yearbookQuestAppsScriptBridge' || data.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(data.payload);
    };

    window.addEventListener('message', handleMessage);

    const bridgeAction = params.action === 'ping'
      ? 'mobileBridgePing'
      : params.action === 'checkName'
        ? 'mobileBridgeCheckName'
        : '';

    if (!bridgeAction) {
      clearTimeout(timer);
      cleanup();
      reject(new Error('This Apps Script action is not available through the mobile bridge.'));
      return;
    }

    const query = new URLSearchParams({
      ...params,
      action: bridgeAction,
      requestId,
      _questDeviceTime: String(Date.now())
    });

    iframe.title = 'Graduate Employability mobile connection';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.referrerPolicy = 'no-referrer';
    iframe.style.position = 'fixed';
    iframe.style.left = '-4px';
    iframe.style.bottom = '-4px';
    iframe.style.width = '2px';
    iframe.style.height = '2px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.src = `${inspected.url}?${query.toString()}`;
    document.body.appendChild(iframe);
  });
}

async function graduateEmployabilityRequest(baseUrl, params, timeoutMs = 30000) {
  // JSONP is attempted first on every device because it returns structured
  // backend errors immediately, including older deployments that do not yet
  // support checkName. The iframe bridge remains a fallback for restrictive
  // installed-PWA environments.
  let firstError;

  try {
    return await jsonpRequest(baseUrl, params, timeoutMs);
  } catch (error) {
    firstError = error;
  }

  try {
    return await appsScriptIframeBridgeRequest(baseUrl, params, 22000);
  } catch (secondError) {
    const mode = isInstalledMobileApp() ? 'installed app' : 'browser';
    throw new Error(
      `Graduate Employability could not connect from this ${mode}. ` +
      `Use the original /exec URL and deploy the Web App as Execute as: Me, Who has access: Anyone. ` +
      `Details: ${secondError.message || firstError?.message || 'Connection failed.'}`
    );
  }
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
          testAction: 'test-paid-url',
          statusId: 'paidConnectionStatus',
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
        testAction: 'test-employability-url',
        statusId: 'employabilityConnectionStatus',
        note: 'Use the /exec URL from the updated Graduate Employability code.gs. The installed app uses a mobile iframe bridge with JSONP fallback.'
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

  stepContent.querySelectorAll('.endpoint-settings-import').forEach((input) => {
    input.addEventListener('change', async (event) => {
      await importEndpointSettingsFile(event.target.files?.[0]);
      event.target.value = '';
    });
  });

}

function setEndpointConnectionStatus(id, message, kind = '') {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = `endpoint-connection-status ${kind}`.trim();
}

function payloadHasUnsupportedAction(payload, action = '') {
  const message = String(payload?.message || '').toLowerCase();
  const code = String(payload?.code || '').toUpperCase();
  return code === 'UNSUPPORTED_ACTION' ||
    message.includes('unsupported action') ||
    message.includes('unknown action') ||
    (action && message.includes(String(action).toLowerCase()) && message.includes('not supported'));
}

function normalizeEmployabilityRecord(record) {
  if (!record || typeof record !== 'object') return { firstName: '', lastName: '' };
  const firstName = record.firstName ?? record.firstname ?? record['First Name'] ?? record['first name'] ?? '';
  const lastName = record.lastName ?? record.lastname ?? record.surname ?? record['Last Name'] ?? record['last name'] ?? '';
  return { firstName: String(firstName || ''), lastName: String(lastName || '') };
}

function findEmployabilityNameInRecords(records, firstName, lastName) {
  const requestedFirst = normalizePersonName(firstName);
  const requestedLast = normalizePersonName(lastName);
  const list = Array.isArray(records) ? records : [];

  for (const record of list) {
    const normalized = normalizeEmployabilityRecord(record);
    if (
      normalizePersonName(normalized.firstName) === requestedFirst &&
      normalizePersonName(normalized.lastName) === requestedLast
    ) {
      return {
        success: true,
        found: true,
        matchedName: `${normalized.lastName}, ${normalized.firstName}`,
        compatibilityMode: 'getData'
      };
    }
  }

  return { success: true, found: false, matchedName: '', compatibilityMode: 'getData' };
}

async function graduateEmployabilityGetDataFallback(baseUrl, firstName, lastName) {
  const payload = await jsonpRequest(baseUrl, {
    action: 'getData',
    sheet: 'graduateEmployability'
  }, 45000);

  if (!payload?.success) {
    const service = String(payload?.service || '').toLowerCase();
    if (service === 'paidlist') {
      throw new Error('The saved Graduate Employability URL points to the Paid List Web App. Save the /exec URL deployed from Graduate Employability code.gs.');
    }
    throw new Error(payload?.message || 'The existing getData endpoint returned an error.');
  }

  if (!Array.isArray(payload.data)) {
    throw new Error('The endpoint connected, but it did not return Graduate Employability records. Confirm that the correct code.gs is deployed.');
  }

  return findEmployabilityNameInRecords(payload.data, firstName, lastName);
}

async function lookupGraduateEmployabilityName(baseUrl, firstName, lastName) {
  let directPayload = null;
  let directError = null;

  try {
    directPayload = await graduateEmployabilityRequest(baseUrl, {
      action: 'checkName',
      firstName,
      lastName
    }, 30000);

    if (directPayload?.success && typeof directPayload.found === 'boolean') {
      return { ...directPayload, compatibilityMode: directPayload.compatibilityMode || 'checkName' };
    }

    if (directPayload?.success && Array.isArray(directPayload.data)) {
      return findEmployabilityNameInRecords(directPayload.data, firstName, lastName);
    }

    if (!payloadHasUnsupportedAction(directPayload, 'checkName')) {
      directError = new Error(directPayload?.message || 'The checkName endpoint returned an invalid response.');
    }
  } catch (error) {
    directError = error;
  }

  try {
    return await graduateEmployabilityGetDataFallback(baseUrl, firstName, lastName);
  } catch (fallbackError) {
    const firstMessage = directPayload?.message || directError?.message || '';
    throw new Error(
      'Graduate Employability could not verify the claimant. The app tried both the new checkName endpoint and the existing getData endpoint. ' +
      `Details: ${fallbackError.message}${firstMessage ? ` Previous response: ${firstMessage}` : ''}`
    );
  }
}

async function testGraduateEmployabilityConnection(baseUrl) {
  let pingPayload = null;
  try {
    pingPayload = await graduateEmployabilityRequest(baseUrl, { action: 'ping' }, 30000);
    if (pingPayload?.success) {
      const service = String(pingPayload.service || '').toLowerCase();
      if (service && service !== 'graduateemployability') {
        throw new Error('This URL belongs to a different Apps Script service. Use the Graduate Employability /exec URL.');
      }
      return { success: true, mode: 'ping' };
    }
  } catch (error) {
    if (!String(error.message || '').toLowerCase().includes('unsupported action')) {
      // Continue to the compatibility test. Old scripts often do not expose ping.
    }
  }

  const payload = await jsonpRequest(baseUrl, { action: 'getData', sheet: 'graduateEmployability' }, 45000);
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'The endpoint is reachable but is not a compatible Graduate Employability Web App.');
  }
  return { success: true, mode: 'getData' };
}

async function testPaidListConnection(baseUrl) {
  try {
    const payload = await jsonpRequest(baseUrl, { action: 'ping' }, 30000);
    if (payload?.success) {
      const service = String(payload.service || '').toLowerCase();
      if (service && service !== 'paidlist') {
        throw new Error('This URL belongs to a different Apps Script service. Use the Paid List /exec URL.');
      }
      return { success: true, mode: 'ping' };
    }
    if (!payloadHasUnsupportedAction(payload, 'ping')) throw new Error(payload?.message || 'Paid List ping failed.');
  } catch (error) {
    const message = String(error.message || '');
    if (message.includes('different Apps Script service')) throw error;
    // Otherwise try the older getEndpoints endpoint before failing.
  }

  const payload = await jsonpRequest(baseUrl, { action: 'getEndpoints' }, 30000);
  if (String(payload?.service || '').toLowerCase() === 'graduateemployability') {
    throw new Error('The saved Paid List URL points to the Graduate Employability Web App. Save the /exec URL deployed from paid-list-code.gs.');
  }
  if (!payload?.success) throw new Error(payload?.message || 'The Paid List endpoint could not be verified.');
  return { success: true, mode: 'getEndpoints' };
}

async function testAppsScriptConnection({ inputId, settingKey, statusId, service }) {
  const input = document.getElementById(inputId);
  const inspected = inspectAppsScriptWebAppUrl(input?.value || settings[settingKey]);
  if (!inspected.valid) {
    setEndpointConnectionStatus(statusId, inspected.message, 'error');
    return false;
  }

  input.value = inspected.url;
  updateSettings({ [settingKey]: inspected.url });
  setEndpointConnectionStatus(statusId, 'Testing connection from this device…', 'testing');

  try {
    const result = service === 'graduateEmployability'
      ? await testGraduateEmployabilityConnection(inspected.url)
      : await testPaidListConnection(inspected.url);
    const note = result.mode === 'getData'
      ? 'Connected using the existing getData compatibility endpoint ✓'
      : result.mode === 'getEndpoints'
        ? 'Connected using the existing Paid List compatibility endpoint ✓'
        : 'Connected successfully on this device ✓';
    setEndpointConnectionStatus(statusId, note, 'success');
    return true;
  } catch (error) {
    setEndpointConnectionStatus(statusId, error.message, 'error');
    return false;
  }
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
      const input = document.getElementById('paidListUrl');
      const inspected = inspectAppsScriptWebAppUrl(input?.value);
      if (!inspected.valid) {
        document.getElementById('paidError').textContent = inspected.message;
        setEndpointConnectionStatus('paidConnectionStatus', inspected.message, 'error');
        return;
      }
      if (input) input.value = inspected.url;
      updateSettings({ paidListWebAppUrl: inspected.url });
      showToast(inspected.correctedFromDev ? 'Saved. The /dev URL was corrected to /exec.' : 'Paid Alumni Web App URL saved.');
      renderStep({ instant: true });
      break;
    }

    case 'test-paid-url':
      await testAppsScriptConnection({
        inputId: 'paidListUrl',
        settingKey: 'paidListWebAppUrl',
        statusId: 'paidConnectionStatus',
        service: 'paidList'
      });
      break;

    case 'export-endpoints':
      await exportEndpointSettings();
      break;

    case 'verify-paid-record':
      await verifyPaidRecord(event.currentTarget);
      break;

    case 'paid-continue':
      if (state.batchRule === 'no-payment' || state.paidVerified) goTo(5);
      break;

    case 'save-employability-url': {
      const input = document.getElementById('employabilityUrl');
      const inspected = inspectAppsScriptWebAppUrl(input?.value);
      if (!inspected.valid) {
        setEndpointConnectionStatus('employabilityConnectionStatus', inspected.message, 'error');
        showToast(inspected.message);
        return;
      }
      if (input) input.value = inspected.url;
      updateSettings({ employabilityWebAppUrl: inspected.url });
      updateState({ employabilityStatus: 'idle', employabilityCompleted: false });
      showToast(inspected.correctedFromDev ? 'Saved. The /dev URL was corrected to /exec.' : 'Graduate Employability Web App URL saved.');
      renderStep({ instant: true });
      break;
    }

    case 'test-employability-url':
      await testAppsScriptConnection({
        inputId: 'employabilityUrl',
        settingKey: 'employabilityWebAppUrl',
        statusId: 'employabilityConnectionStatus',
        service: 'graduateEmployability'
      });
      break;

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
  const entered = inspectAppsScriptWebAppUrl(document.getElementById('paidListUrl')?.value || settings.paidListWebAppUrl);
  if (entered.valid && entered.url !== settings.paidListWebAppUrl) updateSettings({ paidListWebAppUrl: entered.url });

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
  const entered = inspectAppsScriptWebAppUrl(document.getElementById('employabilityUrl')?.value || settings.employabilityWebAppUrl);
  if (entered.valid && entered.url !== settings.employabilityWebAppUrl) updateSettings({ employabilityWebAppUrl: entered.url });

  if (!settings.employabilityWebAppUrl) {
    showToast('Save the Graduate Employability Apps Script Web App URL first.');
    return;
  }

  updateState({ employabilityStatus: 'checking', employabilityCompleted: false, employabilityMessage: '' });
  renderStep({ instant: true });

  try {
    const payload = await lookupGraduateEmployabilityName(
      settings.employabilityWebAppUrl,
      state.firstName,
      state.lastName
    );

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
  const positionGuide = document.getElementById('cameraPositionGuide');
  const error = document.getElementById('cameraError');
  const manualDate = document.getElementById('manualDate');
  if (error) error.textContent = state.claimSyncMessage || '';
  if (manualDate) manualDate.value = state.dateClaimed || todayISO();
  if (state.photo) {
    if (image) { image.src = state.photo; image.hidden = false; }
    if (video) video.hidden = true;
    if (positionGuide) positionGuide.hidden = true;
    if (placeholder) placeholder.hidden = true;
    if (status) { status.textContent = `Photo captured · ${formatDate(state.dateClaimed)}`; status.className = 'camera-status success'; }
    if (captureButton) { captureButton.disabled = false; captureButton.textContent = '📷 Retake in 5 Seconds'; }
    if (finalizeButton) finalizeButton.disabled = false;
  } else {
    if (image) { image.hidden = true; image.removeAttribute('src'); }
    if (video) video.hidden = false;
    if (positionGuide) positionGuide.hidden = false;
    if (placeholder) placeholder.hidden = false;
    if (captureButton) { captureButton.disabled = true; captureButton.textContent = '📷 Capture in 5 Seconds'; }
    if (finalizeButton) finalizeButton.disabled = !state.cameraSkipped;
  }

  const preview = document.querySelector('.camera-modal-preview');
  let blurBadge = preview?.querySelector('.photo-blur-badge');
  if (state.photo && preview) {
    if (!blurBadge) {
      blurBadge = document.createElement('div');
      blurBadge.className = 'photo-blur-badge';
      preview.appendChild(blurBadge);
    }
    blurBadge.textContent = 'Documentation photo background blurred';
  } else {
    blurBadge?.remove();
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
  const positionGuide = document.getElementById('cameraPositionGuide');
  if (video) video.hidden = false;
  if (image) image.hidden = true;
  if (positionGuide) positionGuide.hidden = false;
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
    const errorName = cameraError?.name || '';
    let message = 'The camera could not be started.';

    if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      message = 'Camera access was blocked. In Chrome or Edge, open the site controls beside the address, set Camera to Allow, then close and reopen the installed app. Also confirm that Windows Settings → Privacy & security → Camera allows camera access for desktop apps.';
    } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      message = 'No camera was found. Connect or enable a webcam, then reopen the documentation camera.';
    } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      message = 'The camera is being used by another application. Close apps such as Zoom, Teams, or Camera, then try again.';
    } else if (errorName === 'OverconstrainedError') {
      message = 'The available camera does not support the requested settings. Reconnect the webcam or try another camera.';
    } else if (errorName === 'SecurityError') {
      message = 'The browser blocked camera access for security reasons. Open the installed app from its HTTPS deployment or localhost.';
    }

    showCameraFallback(message);
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
  const maxWidth = 1000;
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  captureCanvas.width = width;
  captureCanvas.height = height;
  const output = captureCanvas.getContext('2d');
  output.clearRect(0, 0, width, height);

  // Layer 1: blurred full photograph. Slightly overscale it so the blur
  // does not create transparent/dark edges around the saved image.
  output.save();
  output.filter = `blur(${Math.max(12, Math.round(width * .018))}px)`;
  const overscan = Math.max(18, Math.round(width * .035));
  output.drawImage(source, -overscan, -overscan, width + overscan * 2, height + overscan * 2);
  output.restore();

  // Layer 2: sharp claimant + yearbook area. The soft elliptical mask is
  // intentionally tall so it keeps the face, upper body, hands, and the
  // yearbook clear while gently blurring the surrounding environment.
  const sharpLayer = document.createElement('canvas');
  sharpLayer.width = width;
  sharpLayer.height = height;
  const sharpContext = sharpLayer.getContext('2d');
  sharpContext.drawImage(source, 0, 0, width, height);

  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext('2d');
  const centerX = width * .5;
  const centerY = height * .48;
  const radiusX = width * .34;
  const radiusY = height * .56;

  maskContext.save();
  maskContext.translate(centerX, centerY);
  maskContext.scale(radiusX, radiusY);
  const feather = maskContext.createRadialGradient(0, 0, 0, 0, 0, 1);
  feather.addColorStop(0, 'rgba(255,255,255,1)');
  feather.addColorStop(.68, 'rgba(255,255,255,1)');
  feather.addColorStop(.86, 'rgba(255,255,255,.82)');
  feather.addColorStop(1, 'rgba(255,255,255,0)');
  maskContext.fillStyle = feather;
  maskContext.beginPath();
  maskContext.arc(0, 0, 1, 0, Math.PI * 2);
  maskContext.fill();
  maskContext.restore();

  sharpContext.globalCompositeOperation = 'destination-in';
  sharpContext.drawImage(mask, 0, 0);
  sharpContext.globalCompositeOperation = 'source-over';
  output.drawImage(sharpLayer, 0, 0);

  return captureCanvas.toDataURL('image/jpeg', .82);
}

function capturePhoto() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.videoWidth || !video.videoHeight) {
    showCameraFallback('The camera is not ready yet. Try again or use the fallback options.');
    return;
  }
  const photo = compressImage(video, video.videoWidth, video.videoHeight);
  updateState({ photo, dateClaimed: todayISO(), cameraSkipped: false, claimSynced: false, claimSyncMessage: '' });
  const positionGuide = document.getElementById('cameraPositionGuide');
  if (positionGuide) positionGuide.hidden = true;
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
restoreSettingsFromPrivateLocalFile().catch((error) => {
  console.warn('Private endpoint settings restore failed.', error);
});
