/**
 * =====================================================================
 * Graduate Employability Survey — Google Apps Script Web App
 * =====================================================================
 * Deploy this script bound to the Graduate Employability Form's
 * Google Sheet (the sheet that stores the Form's responses).
 *
 * Deployment steps
 * ----------------
 *   1. Open the Google Sheet that receives the Graduate Employability
 *      form responses.
 *   2. Extensions → Apps Script.
 *   3. Paste this file, save, then Deploy → New deployment → Web app:
 *          - Execute as:  Me
 *          - Who has access: Anyone
 *      Copy the Web App URL.
 *   4. In your dashboard (http://127.0.0.1:5500/index.html) open
 *      Data Sources (the plug icon), paste the URL into
 *      "Graduate Employability Survey" and Save.
 *
 * Front-end contract
 * ------------------
 *   GET  ?action=getData&sheet=graduateEmployability
 *   →    { success: true, data: [ { …record… }, … ], rowCount: N }
 *
 * Each record is normalized so it plugs directly into the dashboard's
 * generic renderer. Field keys match the column keys defined in
 * script.js under MODULES['graduate-employability'].
 * =====================================================================
 */

const GE_CONFIG = {
  RESPONSE_SHEET_NAME: 'Form Responses 1',

  // Every alias below is matched case-insensitively and with
  // non-alphanumeric characters stripped, so slight header wording
  // differences in the live Form won't break the lookup.
  HEADER_ALIASES: {
    timestamp:          ['timestamp', 'submission time', 'submitted at'],
    email:              ['email address', 'email', 'e-mail address', 'e-mail'],

    lastName:           ['last name', 'surname', 'family name'],
    firstName:          ['first name', 'given name'],
    middleName:         ['middle name', 'middle initial', 'm.i.', 'mi'],
    suffix:             ['suffix (ex: sr., jr., iii, etc.):', 'suffix', 'name suffix'],

    birthdate:          ['birthdate', 'date of birth', 'birthday'],
    civilStatus:        ['civil status', 'civil'],
    sexAtBirth:         ['sex assigned at birth', 'sex at birth', 'sex'],
    genderIdentity:     ['gender identity', 'gender'],

    mobile:             ['mobile number', 'contact number', 'contact', 'mobile', 'cellphone', 'phone'],
    facebook:           ['facebook account link', 'facebook account', 'facebook', 'fb link', 'fb'],

    barangay:           ['barangay'],
    municipality:       ['municipality', 'city/municipality', 'town'],
    province:           ['province/city', 'province / city', 'province', 'city'],
    country:            ['country'],

    isIp:               ['are you member of indigenous peoples (ip) group?', 'are you a member of ip group', 'ip group'],
    isPwd:              ['are you a person with disability?', 'person with disability', 'pwd'],
    pwdType:            ['please indicate your type of disability:', 'type of disability', 'disability type', 'please indicate your type of disability'],
    ipAffiliation:      ['please indicate your indigenous people (ip) affiliation:', 'ip affiliation', 'indigenous affiliation', 'please indicate your indigenous people (ip) affiliation'],

    degree:             [
      'what degree program did you complete at romblon state university?',
      'what degree program did you complete at romblon state university',
      'what degree did you complete at romblon state university?',
      'what degree did you complete at rsu?',
      'degree program',
      'course completed',
      'degree'
    ],
    campusCollege:      ['campus/college', 'campus / college', 'campus', 'college'],
    yearGraduated:      ['year graduated', 'batch', 'graduation year'],
    firstGenCollege:    ['are you the first person in your family to graduate from college?', 'first person in your family to graduate', 'first gen college', '1st gen'],

    pursuedFurther:     ['did you pursue further studies after graduation?', 'pursued further studies'],
    furtherStudyLevel:  ['what level of further study did you pursue?', 'level of further study'],
    furtherProgram:     ['please specify the course, program, or degree.', 'course program or degree', 'further studies program'],
    furtherSchool:      ['name of institution / school', 'name of institution/school', 'institution / school', 'school'],
    furtherLocation:    ['location of institution / school', 'location of institution/school', 'school location'],
    furtherStart:       ['date started'],
    furtherEnd:         ['date completed'],

    presentlyEmployed:  ['are you presently employed?', 'presently employed', 'employed'],
    reasonsNotEmployed: ['what are the reasons why you are not currently employed?', 'reasons not currently employed'],
    lookingForJob:      ['are you currently looking for a job?', 'currently looking for a job', 'job ready'],
    supportNeeded:      ['what kind of support would help you most in finding employment?', 'support to find employment'],

    position:           ['what is your current position?', 'current position', 'position'],
    employer:           ['name of organization / employer', 'name of organization/employer', 'organization', 'employer'],
    employerLocation:   ['location of organization / employer', 'location of organization/employer', 'employer location'],

    sector:             ['sector of employment', 'employment sector'],
    employmentStatus:   ['present employment status', 'employment status'],
    industry:           ["employer's industry / line of business", "employer’s industry / line of business", 'employer industry', 'industry / line of business'],
    jobLevel:           ['current or present job level position', 'job level'],
    reasonsStaying:     ['what were your reasons for staying in your current job?', 'reasons for staying'],
    monthlySalary:      ['what is your current monthly salary in your present employment?', 'current monthly salary'],
    isFirstJob:         ['is this your first job after college?', 'first job after college'],
    firstJobRelated:    ['is your first job related to the degree you completed in college?', 'first job related to degree'],
    reasonsAccepting:   ['what were your reasons for accepting your first job?', 'reasons for accepting first job'],
    howFoundFirst:      ['how did you find your first job?', 'how found first job'],
    timeToFirst:        ['how long did it take you to get your first job after graduation?', 'time to first job'],
    firstJobIncome:     ['what was your initial gross monthly income in your first job after college?', 'first job income'],
    reasonsChangeJob:   ['if you have previously changed jobs, what were your reasons for the change?', 'reasons for changing jobs'],

    inBusiness:         ['are you currently engaged in business or entrepreneurship?', 'engaged in business', 'business'],
    businessName:       ['business / company name', 'business/company name', 'company name'],
    businessRole:       ['what is your role in the business?', 'role in business', 'business role'],
    businessType:       ['what is the nature or industry of your business?', 'nature of business', 'industry of business', 'business type'],
    businessLocation:   ['where is your business located?', 'business location', 'company address'],
    businessStart:      ['when did you start your business?', 'business start date']
  }
};

// ==============================================================
// PUBLIC ENTRY POINT
// ==============================================================
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || 'getData';
  const callback = params.callback;
  let payload;

  try {
    if (action === 'ping') {
      payload = { success: true, service: 'graduateEmployability', timestamp: new Date().toISOString() };
    } else if (action === 'getData') {
      payload = handleGetData_(params);
    } else if (action === 'checkName') {
      // Additive endpoint used by Yearbook Quest. Existing getData behavior
      // remains unchanged for the Graduate Employability dashboard.
      payload = handleCheckName_(params);
    } else if (action === 'getEndpoints') {
      // Kept for compatibility with the dashboard's global-endpoints probe.
      payload = { success: true, endpoints: {} };
    } else {
      throw new Error('Unsupported action: ' + action);
    }
  } catch (err) {
    payload = {
      success: false,
      message: err && err.message ? err.message : 'Unexpected server error.',
      data: []
    };
  }

  return buildOutput_(payload, callback);
}

// ==============================================================
// CORE HANDLER
// ==============================================================
function handleGetData_(params) {
  const sheet = getResponseSheet_();
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const displayValues = dataRange.getDisplayValues();

  if (!values || values.length < 2) {
    return { success: true, data: [], rowCount: 0 };
  }

  const headerRow = values[0];
  const headerMap = buildHeaderMap_(headerRow);

  const records = [];
  for (var i = 1; i < values.length; i++) {
    var rawRow = values[i];
    var dispRow = displayValues[i];

    // Skip completely blank rows.
    if (isBlankRow_(rawRow)) continue;

    var record = buildRecord_(rawRow, dispRow, headerMap, i + 1); // i+1 = 1-based sheet row
    records.push(record);
  }

  return {
    success: true,
    data: records,
    rowCount: records.length
  };
}

// ==============================================================
// ADDITIVE YEARBOOK QUEST NAME CHECK
// ==============================================================
/**
 * Checks only the submitted first name and last name against the Form
 * Responses sheet. This endpoint does not modify any sheet data and does
 * not change the existing getData response used by the dashboard.
 *
 * Request:
 *   GET ?action=checkName&firstName=Jose&lastName=Rizal
 *
 * Response:
 *   { success: true, found: true|false, matchedName: "RIZAL, Jose" }
 */
function handleCheckName_(params) {
  var requestedFirstName = String(params.firstName || '').trim();
  var requestedLastName = String(params.lastName || '').trim();

  if (!requestedFirstName || !requestedLastName) {
    throw new Error('Both firstName and lastName are required.');
  }

  var sheet = getResponseSheet_();
  var dataRange = sheet.getDataRange();
  var values = dataRange.getDisplayValues();

  if (!values || values.length < 2) {
    return {
      success: true,
      found: false,
      firstName: requestedFirstName,
      lastName: requestedLastName,
      matchedName: ''
    };
  }

  var headerMap = buildHeaderMap_(values[0]);
  var firstNameIndex = headerMap.firstName;
  var lastNameIndex = headerMap.lastName;

  if (firstNameIndex == null || firstNameIndex < 0) {
    throw new Error('First name column was not found in the response sheet.');
  }
  if (lastNameIndex == null || lastNameIndex < 0) {
    throw new Error('Last name column was not found in the response sheet.');
  }

  var requestedFirstKey = normalizePersonName_(requestedFirstName);
  var requestedLastKey = normalizePersonName_(requestedLastName);

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (isBlankRow_(row)) continue;

    var rowFirstName = String(row[firstNameIndex] || '').trim();
    var rowLastName = String(row[lastNameIndex] || '').trim();

    if (
      normalizePersonName_(rowFirstName) === requestedFirstKey &&
      normalizePersonName_(rowLastName) === requestedLastKey
    ) {
      return {
        success: true,
        found: true,
        firstName: requestedFirstName,
        lastName: requestedLastName,
        matchedName: composeFullName_(rowLastName, rowFirstName, '', ''),
        sheetRow: i + 1
      };
    }
  }

  return {
    success: true,
    found: false,
    firstName: requestedFirstName,
    lastName: requestedLastName,
    matchedName: ''
  };
}

/**
 * Name-only normalization for matching. It is case-insensitive and ignores
 * spaces, punctuation, apostrophes, hyphens, and common accent marks.
 */
function normalizePersonName_(value) {
  var text = String(value || '').toLowerCase().trim();

  // V8 Apps Script supports String.normalize. Keep a safe fallback for
  // older runtimes or unusual values.
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (ignore) {}

  return text.replace(/[^a-z0-9]/g, '');
}

// ==============================================================
// RECORD BUILDER
// ==============================================================
function buildRecord_(rawRow, dispRow, headerMap, sheetRowNumber) {
  function pick(key) {
    var idx = headerMap[key];
    if (idx == null || idx < 0) return '';
    var disp = dispRow[idx];
    var raw = rawRow[idx];
    if (disp !== '' && disp != null) return disp;
    if (raw instanceof Date) return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return raw == null ? '' : String(raw);
  }

  var lastName   = pick('lastName');
  var firstName  = pick('firstName');
  var middleName = pick('middleName');
  var suffix     = pick('suffix');

  var barangay     = pick('barangay');
  var municipality = pick('municipality');
  var province     = pick('province');

  var record = {
    // Row identity — the dashboard reads this to show the true Google
    // Sheet row number and to key inline edits.
    id: 'row_' + sheetRowNumber,
    sheetRow: sheetRowNumber,

    // Meta
    timestamp: pick('timestamp'),
    email:     pick('email'),

    // Name parts (kept for downstream use) + composed full name.
    lastName:   lastName,
    firstName:  firstName,
    middleName: middleName,
    suffix:     suffix,
    fullName:   composeFullName_(lastName, firstName, suffix, middleName),

    // Demographics
    birthdate:       pick('birthdate'),
    civilStatus:     pick('civilStatus'),
    sexAtBirth:      pick('sexAtBirth'),
    genderIdentity:  pick('genderIdentity'),
    mobile:          pick('mobile'),
    facebook:        pick('facebook'),

    // Address (components + composed).
    barangay:     barangay,
    municipality: municipality,
    province:     province,
    address:      composeAddress_(barangay, municipality, province),

    // PWD & IP
    pwdType:       pick('pwdType'),
    ipAffiliation: pick('ipAffiliation'),

    // Academic
    degree:          pick('degree'),
    campusCollege:   pick('campusCollege'),
    yearGraduated:   pick('yearGraduated'),
    firstGenCollege: pick('firstGenCollege'),

    // Further studies (only the four displayed fields).
    furtherStudyLevel: pick('furtherStudyLevel'),
    furtherProgram:    pick('furtherProgram'),
    furtherSchool:     pick('furtherSchool'),
    furtherLocation:   pick('furtherLocation'),

    // Employment (only displayed fields).
    lookingForJob:    pick('lookingForJob'),
    position:         pick('position'),
    employer:         pick('employer'),
    employerLocation: pick('employerLocation'),
    industry:         pick('industry'),

    // Business (displayed fields).
    inBusiness:       pick('inBusiness'),
    businessName:     pick('businessName'),
    businessRole:     pick('businessRole'),
    businessType:     pick('businessType'),
    businessLocation: pick('businessLocation')
  };

  return record;
}

// ==============================================================
// FORMATTING HELPERS
// ==============================================================
function composeFullName_(last, first, suffix, middle) {
  var cleanLast   = String(last   || '').trim();
  var cleanFirst  = String(first  || '').trim();
  var cleanSuffix = String(suffix || '').trim();
  var cleanMiddle = String(middle || '').trim();

  // Format:  LASTNAME, First Name Suffix Middle Name
  var right = [cleanFirst, cleanSuffix, cleanMiddle].filter(function(x){ return x; }).join(' ');
  var left  = cleanLast ? cleanLast.toUpperCase() : '';

  if (left && right) return left + ', ' + right;
  return left || right;
}

function composeAddress_(barangay, municipality, province) {
  var parts = [barangay, municipality, province]
    .map(function(v){ return String(v || '').trim(); })
    .filter(function(v){ return v; });
  return parts.join(', ');
}

// ==============================================================
// SHEET / HEADER UTILITIES
// ==============================================================
function getResponseSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var direct = spreadsheet.getSheetByName(GE_CONFIG.RESPONSE_SHEET_NAME);
  if (direct) return direct;

  var target = normalizeKey_(GE_CONFIG.RESPONSE_SHEET_NAME);
  var match = spreadsheet.getSheets().find(function(s){
    return normalizeKey_(s.getName()) === target;
  });
  if (match) return match;

  // Fallback — many form-response sheets are simply named "Form Responses 1".
  var sheets = spreadsheet.getSheets();
  if (sheets.length === 1) return sheets[0];

  throw new Error('Response sheet not found: ' + GE_CONFIG.RESPONSE_SHEET_NAME);
}

function buildHeaderMap_(headerRow) {
  var normalizedHeaders = headerRow.map(function(h){ return normalizeKey_(h); });
  var map = {};

  Object.keys(GE_CONFIG.HEADER_ALIASES).forEach(function(key) {
    var aliases = GE_CONFIG.HEADER_ALIASES[key].map(normalizeKey_);
    var foundIndex = -1;
    for (var i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.indexOf(normalizedHeaders[i]) >= 0) { foundIndex = i; break; }
    }
    // Substring fallback — some Form question labels are extremely long.
    if (foundIndex < 0) {
      for (var j = 0; j < normalizedHeaders.length; j++) {
        var nh = normalizedHeaders[j];
        for (var k = 0; k < aliases.length; k++) {
          if (nh && aliases[k] && nh.indexOf(aliases[k]) === 0) { foundIndex = j; break; }
        }
        if (foundIndex >= 0) break;
      }
    }
    map[key] = foundIndex;
  });

  return map;
}

function normalizeKey_(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

function isBlankRow_(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] !== '' && row[i] != null) return false;
  }
  return true;
}

// ==============================================================
// RESPONSE ENVELOPE
// ==============================================================
function buildOutput_(payload, callback) {
  if (callback) {
    var safe = String(callback).replace(/[^a-zA-Z0-9_$.]/g, '');
    return ContentService
      .createTextOutput(safe + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
