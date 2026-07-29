/**
 * =====================================================================
 * Yearbook Quest — Paid Alumni & Claim Status Web App
 * =====================================================================
 * Bind this script to the Google Spreadsheet that will store the paid
 * alumni lists. The script automatically creates one sheet for every
 * yearbook batch that is currently available.
 *
 * Created batch sheets:
 *   Payment required:    2025, 2023, 2022
 *   No payment required: 2020, 2019, 2018, 2015, 2014, 2012, 2010
 *
 * Each sheet contains exactly these columns:
 *   A: Lastname
 *   B: First Name
 *   C: OR number
 *   D: Status
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Front-end endpoints:
 *   ?action=checkPaidAlumni&batch=2025&firstName=Jose&lastName=Rizal&orNumber=12345
 *   ?action=markClaimed&batch=2025&firstName=Jose&lastName=Rizal&orNumber=12345
 * =====================================================================
 */

const YQ_PAID_CONFIG = {
  PAYMENT_REQUIRED_BATCHES: ['2025', '2023', '2022'],
  NO_PAYMENT_BATCHES: ['2020', '2019', '2018', '2015', '2014', '2012', '2010'],
  NO_YEARBOOK_BATCHES: ['2024', '2017', '2016', '2013'],
  HEADERS: ['Lastname', 'First Name', 'OR number', 'Status'],
  STATUS_CLAIMED: 'Claimed'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Yearbook Quest')
    .addItem('Create or Repair Batch Sheets', 'setupYearbookSheets')
    .addToUi();

  // This automatically creates missing batch sheets whenever the
  // spreadsheet is opened by an editor.
  ensureYearbookSheets_();
}

/**
 * Manually runnable setup function. It is safe to run repeatedly.
 */
function setupYearbookSheets() {
  const result = ensureYearbookSheets_();
  try {
    SpreadsheetApp.getUi().alert(
      'Yearbook Quest setup complete.\n\nCreated: ' +
      (result.created.length ? result.created.join(', ') : 'None') +
      '\nVerified: ' + result.verified.join(', ')
    );
  } catch (ignore) {
    // No UI is available when called from the Web App.
  }
  return result;
}

const YQ_PAID_WEB_APP_VERSION = '2026.07.27.2';
const YQ_PAID_SUPPORTED_ACTIONS = [
  'ping',
  'setupSheets',
  'checkPaidAlumni',
  'markClaimed',
  'checkClaimHistory',
  'getBatchRules',
  'getEndpoints'
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  const rawAction = String(params.action || 'setupSheets');
  const action = normalizePaidAction_(rawAction);
  const callback = params.callback;
  let payload;

  try {
    ensureYearbookSheets_();

    if (action === 'ping') {
      payload = {
        success: true,
        service: 'paidList',
        version: YQ_PAID_WEB_APP_VERSION,
        timestamp: new Date().toISOString()
      };
    } else if (action === 'setupSheets') {
      payload = { success: true, setup: ensureYearbookSheets_() };
    } else if (action === 'checkPaidAlumni') {
      payload = handleCheckPaidAlumni_(params);
    } else if (action === 'markClaimed') {
      payload = handleMarkClaimed_(params);
    } else if (action === 'checkClaimHistory') {
      payload = handleCheckClaimHistory_(params);
    } else if (action === 'getBatchRules') {
      payload = {
        success: true,
        paymentRequired: YQ_PAID_CONFIG.PAYMENT_REQUIRED_BATCHES,
        noPaymentRequired: YQ_PAID_CONFIG.NO_PAYMENT_BATCHES,
        noYearbookAvailable: YQ_PAID_CONFIG.NO_YEARBOOK_BATCHES
      };
    } else if (action === 'getEndpoints') {
      payload = {
        success: true,
        endpoints: {
          ping: 'ping',
          checkPaidAlumni: 'checkPaidAlumni',
          markClaimed: 'markClaimed',
          checkClaimHistory: 'checkClaimHistory',
          setupSheets: 'setupSheets',
          getBatchRules: 'getBatchRules'
        }
      };
    } else {
      payload = {
        success: false,
        code: 'UNSUPPORTED_ACTION',
        service: 'paidList',
        version: YQ_PAID_WEB_APP_VERSION,
        action: rawAction,
        supportedActions: YQ_PAID_SUPPORTED_ACTIONS,
        message: 'Unsupported action: ' + rawAction + '. Confirm that this URL belongs to the Paid List Web App.'
      };
    }
  } catch (error) {
    payload = {
      success: false,
      code: 'BACKEND_ERROR',
      service: 'paidList',
      version: YQ_PAID_WEB_APP_VERSION,
      action: rawAction,
      message: error && error.message ? error.message : 'Unexpected server error.'
    };
  }

  if (payload && typeof payload === 'object') {
    if (!payload.service) payload.service = 'paidList';
    if (!payload.version) payload.version = YQ_PAID_WEB_APP_VERSION;
  }

  return buildYearbookOutput_(payload, callback);
}

function doPost(e) {
  var params = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function(key) { params[key] = e.parameter[key]; });
  }

  try {
    var body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : null;
    if (body && typeof body === 'object') {
      Object.keys(body).forEach(function(key) { params[key] = body[key]; });
    }
  } catch (ignore) {
    // Continue with URL-encoded parameters.
  }

  return doGet({ parameter: params });
}

function normalizePaidAction_(value) {
  var key = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (!key || key === 'setupsheets' || key === 'setup' || key === 'createsheets') return 'setupSheets';
  if (key === 'ping' || key === 'health' || key === 'status') return 'ping';
  if (key === 'checkpaidalumni' || key === 'checkpaid' || key === 'verifypayment' || key === 'searchpaidlist') return 'checkPaidAlumni';
  if (key === 'markclaimed' || key === 'claim' || key === 'saveclaim') return 'markClaimed';
  if (key === 'checkclaimhistory' || key === 'claimhistory' || key === 'findclaims') return 'checkClaimHistory';
  if (key === 'getbatchrules' || key === 'batchrules') return 'getBatchRules';
  if (key === 'getendpoints' || key === 'endpoints') return 'getEndpoints';
  return '';
}

/**
 * Searches the sheet named after the selected batch.
 * For 2025, 2023 and 2022, Lastname + First Name + OR number must match.
 */
function handleCheckPaidAlumni_(params) {
  const request = validateRequest_(params, true);
  const rule = getBatchRule_(request.batch);

  if (rule === 'no-yearbook') {
    return {
      success: true,
      eligible: false,
      found: false,
      noYearbook: true,
      message: 'No Yearbook Available for Batch ' + request.batch + '.'
    };
  }

  if (rule === 'no-payment') {
    return {
      success: true,
      eligible: true,
      found: true,
      paymentRequired: false,
      alreadyClaimed: false,
      message: 'Yearbook payment is not required for Batch ' + request.batch + '.'
    };
  }

  if (!request.orNumber) {
    throw new Error('OR number is required for Batch ' + request.batch + '.');
  }

  const sheet = getBatchSheet_(request.batch);
  const table = readBatchTable_(sheet);
  const match = findMatchingRow_(table, request, true);

  if (!match) {
    return {
      success: true,
      eligible: false,
      found: false,
      paymentRequired: true,
      alreadyClaimed: false,
      message: 'No exact paid-alumni record matched the submitted name and OR number.'
    };
  }

  const alreadyClaimed = normalizeStatus_(match.status) === normalizeStatus_(YQ_PAID_CONFIG.STATUS_CLAIMED);
  return {
    success: true,
    eligible: !alreadyClaimed,
    found: true,
    paymentRequired: true,
    alreadyClaimed: alreadyClaimed,
    sheetRow: match.rowNumber,
    record: {
      lastName: match.lastName,
      firstName: match.firstName,
      orNumber: match.orNumber,
      status: match.status
    },
    message: alreadyClaimed
      ? 'This paid-alumni record is already marked Claimed.'
      : 'Paid-alumni record verified.'
  };
}

/**
 * Writes Claimed into the Status column only after the front end confirms
 * that all requirements are complete.
 *
 * Payment-required batches must already have a matching Name + OR row.
 * No-payment batches may be appended automatically when no row exists yet.
 */
function handleMarkClaimed_(params) {
  const request = validateRequest_(params, false);
  const rule = getBatchRule_(request.batch);

  if (rule === 'no-yearbook') {
    throw new Error('No Yearbook Available for Batch ' + request.batch + '.');
  }
  if (rule === 'unsupported') {
    throw new Error('Batch ' + request.batch + ' is not configured in Yearbook Quest.');
  }
  if (rule === 'payment-required' && !request.orNumber) {
    throw new Error('OR number is required before Batch ' + request.batch + ' can be marked Claimed.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = getBatchSheet_(request.batch);
    const table = readBatchTable_(sheet);
    const requireOr = rule === 'payment-required';
    let match = findMatchingRow_(table, request, requireOr);

    if (!match && requireOr) {
      throw new Error('The paid-alumni record could not be found. Check the name and OR number before finalizing.');
    }

    if (!match) {
      // No-payment batches do not need a paid roster entry. Create the
      // claimant record automatically so the Status can still be recorded.
      const newRow = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(newRow, 1, 1, 4).setValues([[
        request.lastName,
        request.firstName,
        '',
        YQ_PAID_CONFIG.STATUS_CLAIMED
      ]]);
      SpreadsheetApp.flush();

      return attachClaimHistory_({
        success: true,
        claimed: true,
        appended: true,
        alreadyClaimed: false,
        batch: request.batch,
        sheetRow: newRow,
        status: YQ_PAID_CONFIG.STATUS_CLAIMED,
        message: 'A new no-payment claimant record was added and marked Claimed.'
      }, request);
    }

    const alreadyClaimed = normalizeStatus_(match.status) === normalizeStatus_(YQ_PAID_CONFIG.STATUS_CLAIMED);
    if (!alreadyClaimed) {
      sheet.getRange(match.rowNumber, table.statusIndex + 1)
        .setValue(YQ_PAID_CONFIG.STATUS_CLAIMED);
      SpreadsheetApp.flush();
    }

    return attachClaimHistory_({
      success: true,
      claimed: true,
      appended: false,
      alreadyClaimed: alreadyClaimed,
      batch: request.batch,
      sheetRow: match.rowNumber,
      status: YQ_PAID_CONFIG.STATUS_CLAIMED,
      message: alreadyClaimed
        ? 'The record was already marked Claimed.'
        : 'The record has been marked Claimed.'
    }, request);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Checks every sheet that uses the Yearbook Quest four-column format and
 * returns all rows for the same claimant whose Status is Claimed.
 * This includes manually created older batch sheets such as 2003.
 */
function handleCheckClaimHistory_(params) {
  const request = validateNameOnlyRequest_(params);
  const history = findClaimedRecordsForName_(request.lastName, request.firstName);
  return {
    success: true,
    claimedBatches: history.claimedBatches,
    claimedRecordCount: history.records.length,
    duplicateClaim: history.records.length > 1,
    records: history.records,
    message: history.records.length > 1
      ? 'Multiple claimed yearbook records were found.'
      : history.records.length === 1
        ? 'One claimed yearbook record was found.'
        : 'No claimed yearbook record was found.'
  };
}

function attachClaimHistory_(payload, request) {
  const history = findClaimedRecordsForName_(request.lastName, request.firstName);
  payload.claimedBatches = history.claimedBatches;
  payload.claimedRecordCount = history.records.length;
  payload.duplicateClaim = history.records.length > 1;
  payload.claimedRecords = history.records;
  if (payload.duplicateClaim) {
    payload.message += ' Warning: this claimant has multiple Claimed records.';
  }
  return payload;
}

function findClaimedRecordsForName_(lastName, firstName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const requestedLast = normalizePersonName_(lastName);
  const requestedFirst = normalizePersonName_(firstName);
  const records = [];

  spreadsheet.getSheets().forEach(function(sheet) {
    let table;
    try {
      table = readBatchTable_(sheet);
    } catch (ignore) {
      // Ignore sheets that are not yearbook batch sheets.
      return;
    }

    for (let index = 1; index < table.values.length; index += 1) {
      const row = table.values[index];
      const rowLast = String(row[table.lastNameIndex] || '').trim();
      const rowFirst = String(row[table.firstNameIndex] || '').trim();
      const rowStatus = String(row[table.statusIndex] || '').trim();

      const sameName =
        normalizePersonName_(rowLast) === requestedLast &&
        normalizePersonName_(rowFirst) === requestedFirst;
      const isClaimed = normalizeStatus_(rowStatus) === normalizeStatus_(YQ_PAID_CONFIG.STATUS_CLAIMED);

      if (sameName && isClaimed) {
        records.push({
          batch: String(sheet.getName()).trim(),
          sheetName: sheet.getName(),
          sheetRow: index + 1,
          lastName: rowLast,
          firstName: rowFirst,
          orNumber: String(row[table.orNumberIndex] || '').trim(),
          status: rowStatus
        });
      }
    }
  });

  const claimedBatches = records
    .map(function(record) { return record.batch; })
    .filter(function(batch, index, values) { return values.indexOf(batch) === index; })
    .sort(function(a, b) {
      const aNumber = Number(a);
      const bNumber = Number(b);
      if (!isNaN(aNumber) && !isNaN(bNumber)) return aNumber - bNumber;
      return String(a).localeCompare(String(b), undefined, { numeric: true });
    });

  return { records: records, claimedBatches: claimedBatches };
}

function validateNameOnlyRequest_(params) {
  const firstName = String(params.firstName || '').trim();
  const lastName = String(params.lastName || '').trim();
  if (!firstName) throw new Error('First Name is required.');
  if (!lastName) throw new Error('Lastname is required.');
  return { firstName: firstName, lastName: lastName };
}

function validateRequest_(params, checkingOnly) {
  const batch = String(params.batch || '').trim();
  const firstName = String(params.firstName || '').trim();
  const lastName = String(params.lastName || '').trim();
  const orNumber = String(params.orNumber || '').trim();

  if (!batch) throw new Error('Batch is required.');
  if (!firstName) throw new Error('First Name is required.');
  if (!lastName) throw new Error('Lastname is required.');

  const rule = getBatchRule_(batch);
  if (rule === 'unsupported') {
    throw new Error('Batch ' + batch + ' is not configured in Yearbook Quest.');
  }
  if (checkingOnly && rule === 'payment-required' && !orNumber) {
    throw new Error('OR number is required for Batch ' + batch + '.');
  }

  return {
    batch: batch,
    firstName: firstName,
    lastName: lastName,
    orNumber: orNumber,
    dateClaimed: String(params.dateClaimed || '').trim()
  };
}

function getBatchRule_(batch) {
  const value = String(batch || '');
  if (YQ_PAID_CONFIG.PAYMENT_REQUIRED_BATCHES.indexOf(value) >= 0) return 'payment-required';
  if (YQ_PAID_CONFIG.NO_PAYMENT_BATCHES.indexOf(value) >= 0) return 'no-payment';
  if (YQ_PAID_CONFIG.NO_YEARBOOK_BATCHES.indexOf(value) >= 0) return 'no-yearbook';
  return 'unsupported';
}

function getAvailableBatches_() {
  return YQ_PAID_CONFIG.PAYMENT_REQUIRED_BATCHES
    .concat(YQ_PAID_CONFIG.NO_PAYMENT_BATCHES)
    .sort(function(a, b) { return Number(b) - Number(a); });
}

function ensureYearbookSheets_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const verified = [];

  getAvailableBatches_().forEach(function(batch) {
    let sheet = spreadsheet.getSheetByName(batch);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(batch);
      created.push(batch);
    }

    ensureBatchHeaders_(sheet);
    formatBatchSheet_(sheet);
    verified.push(batch);
  });

  return { created: created, verified: verified };
}

function ensureBatchHeaders_(sheet) {
  const expected = YQ_PAID_CONFIG.HEADERS;
  const current = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  const currentKeys = current.map(normalizeHeader_);
  const expectedKeys = expected.map(normalizeHeader_);
  const hasAllHeaders = expectedKeys.every(function(key) {
    return currentKeys.indexOf(key) >= 0;
  });

  if (!hasAllHeaders) {
    const firstRowHasContent = current.some(function(value) {
      return String(value || '').trim() !== '';
    });

    if (firstRowHasContent) sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  }
}

function formatBatchSheet_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, 4);
  headerRange
    .setFontWeight('bold')
    .setBackground('#7a3512')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 130);
  sheet.getRange('C:C').setNumberFormat('@');

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([YQ_PAID_CONFIG.STATUS_CLAIMED], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
}

function getBatchSheet_(batch) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(String(batch));
  if (!sheet) throw new Error('Batch sheet not found: ' + batch);
  return sheet;
}

function readBatchTable_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), 4);
  const values = lastRow > 0
    ? sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues()
    : [YQ_PAID_CONFIG.HEADERS];
  const headers = values[0] || [];
  const map = buildPaidHeaderMap_(headers);

  if (map.lastName < 0 || map.firstName < 0 || map.orNumber < 0 || map.status < 0) {
    throw new Error('The batch sheet must contain Lastname, First Name, OR number, and Status columns.');
  }

  return {
    values: values,
    lastNameIndex: map.lastName,
    firstNameIndex: map.firstName,
    orNumberIndex: map.orNumber,
    statusIndex: map.status
  };
}

function buildPaidHeaderMap_(headers) {
  const normalized = headers.map(normalizeHeader_);
  return {
    lastName: findHeaderIndex_(normalized, ['lastname', 'last name', 'surname']),
    firstName: findHeaderIndex_(normalized, ['firstname', 'first name', 'given name']),
    orNumber: findHeaderIndex_(normalized, ['ornumber', 'or number', 'official receipt number', 'receipt number']),
    status: findHeaderIndex_(normalized, ['status', 'claim status'])
  };
}

function findHeaderIndex_(normalizedHeaders, aliases) {
  const keys = aliases.map(normalizeHeader_);
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    if (keys.indexOf(normalizedHeaders[index]) >= 0) return index;
  }
  return -1;
}

function findMatchingRow_(table, request, requireOr) {
  const requestedLast = normalizePersonName_(request.lastName);
  const requestedFirst = normalizePersonName_(request.firstName);
  const requestedOr = normalizeOrNumber_(request.orNumber);

  for (let index = 1; index < table.values.length; index += 1) {
    const row = table.values[index];
    const rowLast = String(row[table.lastNameIndex] || '').trim();
    const rowFirst = String(row[table.firstNameIndex] || '').trim();
    const rowOr = String(row[table.orNumberIndex] || '').trim();

    const namesMatch =
      normalizePersonName_(rowLast) === requestedLast &&
      normalizePersonName_(rowFirst) === requestedFirst;
    const orMatches = !requireOr || normalizeOrNumber_(rowOr) === requestedOr;

    if (namesMatch && orMatches) {
      return {
        rowNumber: index + 1,
        lastName: rowLast,
        firstName: rowFirst,
        orNumber: rowOr,
        status: String(row[table.statusIndex] || '').trim()
      };
    }
  }

  return null;
}

function normalizePersonName_(value) {
  let text = String(value || '').toLowerCase().trim();
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (ignore) {}
  return text.replace(/[^a-z0-9]/g, '');
}

function normalizeOrNumber_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeStatus_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function buildYearbookOutput_(payload, callback) {
  if (callback) {
    const safeCallback = String(callback).replace(/[^a-zA-Z0-9_$.]/g, '');
    return ContentService
      .createTextOutput(safeCallback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
