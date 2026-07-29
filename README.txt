YEARBOOK QUEST — GOOGLE SHEETS UPDATE
=====================================

PROJECT FILES
-------------
index.html
style.css
script.js
code.gs                         Existing Graduate Employability Web App
paid-list-code.gs               New Paid Alumni / Claimed Status Web App
assets/library-scene.jpg
assets/graduate-employability-form-qr.png

WHAT WAS UPDATED
----------------
1. Office Survey
   - Continue becomes enabled after the survey popup opens successfully for
     the first time.
   - The SurveyMars page is embedded inside a full-screen modal.
   - The iframe and modal body support vertical scrolling.
   - An "Open in New Tab" fallback is included.

2. Paid Alumni Google Sheet Lookup
   - 2025, 2023, and 2022 require:
       Lastname + First Name + OR number
     The values must match a row in the selected batch sheet.

   - 2020, 2019, 2018, 2015, 2014, 2012, and 2010 do not require payment.
     The payment Continue button is available automatically.

   - 2024, 2017, 2016, and 2013 display "No Yearbook Available" and cannot
     continue to the remaining requirements.

3. Automatic Claimed Status
   - After the claim photo/manual fallback and all other requirements are
     complete, the front end calls paid-list-code.gs.
   - The correct batch sheet Status becomes "Claimed".
   - For payment-required batches, the existing Name + OR row is updated.
   - For no-payment batches, the claimant is updated if already listed or
     appended automatically if no row exists.

4. Claim Photo
   - Captured/uploaded photos download automatically.
   - File format:
       M-D-YYYY-Batch-Lastname, Firstname.jpg

GOOGLE APPS SCRIPT SETUP A — GRADUATE EMPLOYABILITY
----------------------------------------------------
Use the existing code.gs supplied in this project.

1. Open the Google Sheet receiving Graduate Employability Form responses.
2. Extensions > Apps Script.
3. Keep/paste code.gs.
4. Deploy > New deployment > Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Copy the /exec URL.
8. Paste it in the Graduate Employability step's Data Source Setup.

The front end uses:
?action=checkName&firstName=Jose&lastName=Rizal

GOOGLE APPS SCRIPT SETUP B — PAID ALUMNI LIST
----------------------------------------------
Use a separate Google Spreadsheet for the paid alumni list.

1. Create/open the Paid Alumni Google Spreadsheet.
2. Extensions > Apps Script.
3. Paste paid-list-code.gs into the Apps Script editor.
4. Save and run setupYearbookSheets once. Approve permissions.
5. The script automatically creates these sheets:
       2025, 2023, 2022,
       2020, 2019, 2018, 2015, 2014, 2012, 2010
6. Every sheet contains:
       Lastname | First Name | OR number | Status
7. Encode the paid alumni in sheets 2025, 2023, and 2022.
   Leave Status blank until the claimant finishes the quest.
8. Deploy > New deployment > Web app.
9. Execute as: Me.
10. Who has access: Anyone.
11. Copy the /exec URL.
12. Paste it in the Paid Alumni step's Data Source Setup.

The Web App URLs are stored in the browser's localStorage and remain available
when starting a new claimant.

TEST URLS
---------
Paid record check:
<PAID_WEB_APP_URL>?action=checkPaidAlumni&batch=2025&firstName=Jose&lastName=Rizal&orNumber=12345

Manual sheet setup:
<PAID_WEB_APP_URL>?action=setupSheets

Graduate Employability check:
<EMPLOYABILITY_WEB_APP_URL>?action=checkName&firstName=Jose&lastName=Rizal

IMPORTANT
---------
- Run the website through HTTPS or localhost for camera access.
- Apps Script Web Apps must be deployed with access set to Anyone.
- The Office Survey Continue button verifies only that the popup was opened;
  a cross-origin website cannot reliably tell the front end whether the survey
  was submitted.
- Browsers cannot silently save directly to the Windows Desktop. The photo is
  downloaded to the browser's configured download folder.

STATIC CHARACTER UPDATE
- Yuna remains visible as the original guide character.
- All visual character animations have been disabled.
- Voice instructions and the Voice On/Off control remain available.

PHOTO CAPTURE UPDATE
- The camera no longer performs face or yearbook detection.
- Clicking Capture starts a visible 5-second countdown before the photo is taken.
- Photo-step buttons use responsive wrapping for desktop, tablet, and mobile screens.


DUPLICATE CLAIM CHECK
---------------------
After markClaimed succeeds, paid-list-code.gs scans every sheet that contains
Lastname, First Name, OR number, and Status columns. All Claimed rows matching
the claimant are returned to the front end. Example final status:
  Claimed 2003, Claimed 2018

When more than one matching Claimed row exists, the final screen displays a
warning popup and disables Finish & New Claim. Staff must verify or correct the
Google Sheet records before allowing the process to close normally.

After replacing paid-list-code.gs, create a NEW Apps Script deployment version
(or edit the deployment to use the new version), then keep using the same /exec
URL in the Yearbook Quest Paid Alumni setup field.

RESPONSIVE UPDATE
-----------------
This version includes a complete responsive CSS pass for the full quest,
including forms, buttons, camera controls, the final record, duplicate-warning
card, Office Survey modal, and duplicate-claim popup. Layout changes are based
on both viewport size and the actual width of the parchment panel.

DISPLAY FIX IN THIS VERSION
---------------------------
The desktop parchment no longer expands from the top navigation to the bottom
of short laptop screens. Intro and simple steps use compact panels, while long
forms, photo, and summary screens use bounded internal scrolling.

CAMERA TESTING
--------------
The screenshot shows the project opened with a file:/// address. Camera access
will not work reliably in that mode. Run index.html through localhost or HTTPS.
With VS Code, use the Live Server extension and choose "Open with Live Server".


LATEST UPDATE — RESOLVE PASSWORD AND CAMERA MODAL
-------------------------------------------------
- Duplicate-claim summary replaces Download Photo Again with Resolve.
- Resolve requires authorized password 0143.
- Correct password clears the saved claim and restarts all requirements.
- Documentation photo opens in a large responsive modal.
- Back, Capture in 5 Seconds, and Finalize Claim remain fixed in the footer.
- Live preview uses object-fit: contain for comfortable positioning.

Security note: password 0143 is checked in browser JavaScript. For stronger security,
verify authorization with a protected server-side Apps Script endpoint.

======================================================================
MOBILE INSTALLATION / PWA
======================================================================
This version includes:
- manifest.webmanifest
- service-worker.js
- pwa.js
- Android, maskable, and Apple touch icons
- Offline app-shell caching
- An Install App button and iPhone installation instructions

IMPORTANT:
A Progressive Web App cannot be installed when index.html is opened using a
file:/// address. Camera access and installation require HTTPS or localhost.

Recommended deployment:
1. Upload the entire project folder to Netlify, GitHub Pages, Firebase Hosting,
   or another HTTPS host. Do not omit manifest.webmanifest, service-worker.js,
   pwa.js, or the icon files.
2. Open the HTTPS link on the phone.
3. Android Chrome/Edge: tap Install App or browser menu > Install app.
4. iPhone/iPad Safari: Share > Add to Home Screen > Add.

Offline note:
The interface and local assets are cached for offline loading. Google Sheets,
Graduate Employability verification, SurveyMars, and final synchronization
still require an internet connection because those services are online.


======================================================================
PHONE ERROR — GRADUATE EMPLOYABILITY WEB APP COULD NOT BE REACHED
======================================================================
This version validates the Apps Script address before saving it and includes a
"Test on This Device" button.

The accepted URL must:
- begin with https://script.google.com/
- be the original deployment URL from Deploy > Manage deployments
- end with /exec

Do NOT paste:
- a /dev testing URL
- a temporary script.googleusercontent.com redirect URL
- a URL that requires Google sign-in

Apps Script deployment settings:
- Execute as: Me
- Who has access: Anyone

After changing code.gs, edit the deployment and select a NEW VERSION. Then open
the installed mobile app, paste the /exec URL again, save it, and use
"Test on This Device" before checking a claimant name.


MOBILE CHARACTER AND GRADUATE EMPLOYABILITY UPDATE
==================================================
1. Yuna is now shown in a dedicated mobile portrait made from the existing
   library background character. No separate replacement character is used.
2. Replace the Graduate Employability Apps Script with the updated code.gs.
3. In Apps Script, open Deploy > Manage deployments, edit the Web App, choose
   New version, set Execute as Me, and set Who has access to Anyone.
4. Keep the same original script.google.com URL ending in /exec.
5. After uploading this PWA update, open the installed app while online and
   accept the Update Now prompt. If the old version remains, close the app
   completely and reopen it, or remove and reinstall the PWA.
6. In the Graduate Employability step, use Test on This Device. The installed
   app now uses an iframe postMessage bridge first and JSONP as a fallback.


======================================================================
BACKEND COMPATIBILITY FIX — UNSUPPORTED ACTION: checkName
======================================================================

The front end now supports BOTH Graduate Employability backend versions:

1. New backend: action=checkName
2. Existing/older backend: action=getData

When checkName returns "Unsupported action", the app automatically requests
getData and checks First Name + Last Name locally. This prevents the claim
flow from failing while an older deployment is still active.

The included code.gs also accepts these aliases:
  checkName, check_name, verifyName, findName, mobileBridgeCheckName

For the cleanest setup, replace the Apps Script project code with the new
code.gs and create a NEW deployment version. Existing getData behavior is
preserved.

======================================================================
LOCAL BACKUP OF GOOGLE APPS SCRIPT LINKS
======================================================================

The app now saves both URLs in three ways:

1. localStorage inside the browser/PWA
2. A private local file in the installed app storage when supported
3. A portable JSON file through "Save Links to Local File"

Use "Restore Links from File" after reinstalling the PWA or moving to a new
phone. The portable filename is:

  yearbook-quest-data-sources.json

Browsers do not allow a website to silently write into an arbitrary visible
phone or Windows folder. The save-file picker or download dialog therefore
appears when a portable backup is created.


============================================================
DESKTOP INSTALLATION AND CAMERA ACCESS
============================================================
1. Upload the complete project folder to an HTTPS host. Camera access does
   not work when index.html is opened through a file:/// address.
2. Open the HTTPS website in Google Chrome or Microsoft Edge.
3. Use the browser menu and choose Install Yearbook Quest / Install app.
4. In the installed app, proceed to Documentation Photo and open the camera.
5. When prompted, choose Allow.

If permission was previously blocked:
- Chrome/Edge: open the original website, click the site-controls or lock icon
  beside the address, set Camera to Allow, then restart the installed app.
- Windows 11: Settings > Privacy & security > Camera. Enable Camera access,
  Let apps access your camera, and Let desktop apps access your camera.
- Close Zoom, Teams, OBS, Windows Camera, or another app that may be using
  the webcam.

The code uses navigator.mediaDevices.getUserMedia(), requests video only,
and stops the camera stream when the camera popup is closed.

BACKGROUND BLUR
The library scene behind the interface now has a moderate blur. Parchment
panels, buttons, text, modals, camera preview, and captured documentation
photos remain sharp. This does not perform AI subject-background separation
inside the captured claimant photo.


DOCUMENTATION PHOTO BLUR UPDATE
-------------------------------
The library scene remains clear. The saved documentation photo now uses a portrait-style background blur while keeping the centered claimant and yearbook sharp. For best results, keep the claimant and yearbook centered in the camera frame.


CAMERA POSITION GUIDE UPDATE
----------------------------
The live camera preview now displays a face oval, shoulder outline, center line, and yearbook placement box. These guide graphics are interface overlays only and are not included in the captured or downloaded documentation photo.
