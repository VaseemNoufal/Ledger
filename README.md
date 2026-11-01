# SiteLedger — Construction Project Expense Tracker

SiteLedger is a clean, responsive, no-login expense tracker made with **HTML, CSS, and vanilla JavaScript**. No backend, subscriptions, database, or internet connection is required to record expenses once the site files are available.

## Quick start (Windows)

1. Extract the **entire ZIP** into a folder. Do not move `index.html` away from `app.js`, `styles.css`, and `assets`.
2. Open the folder with **VS Code** and use the **Live Server** extension on `index.html` (recommended).
3. Alternatively, if Python is installed, open Command Prompt in the extracted folder, run:

   ```bash
   py -m http.server 5500
   ```

   Then visit `http://localhost:5500` in Chrome or Edge.
4. You can also try double-clicking `index.html`, but browser storage behavior for `file://` pages can vary. Using Live Server or the Python command gives more consistent storage behavior.
5. The app opens straight to **Add expense**, with no login.

## How to use

1. Click **New project** and enter the project name and client name. You can also optionally enter the location and project start date.
2. On **Add expense**, choose the project/client from the dropdown, select the expense date, write the purpose (cement, TMT steel, labour, etc.), enter the amount, and press **Save expense**.
3. Keep entering expenses for any client in the same form. The chosen project and expense date stay selected after saving so you can record several items quickly.
4. Open **Projects** and click a project card to see its own expense register.
5. In project details, the table automatically groups entries by **month and year** and sorts by **expense date**, not the date they were entered. Entries show **S.No, expense name, date, amount**, and an Edit button. Month headers show subtotals. Older dates (including years before 2024) work.
6. Open **All expenses** to see the cross-project register, with client/project names, year filtering, searching, and oldest/newest sorting.
7. The **Overview** page displays spending totals, recent entries, last-six-month spending, and project rankings.

## Backup and restore (very important)

- Open **Settings & backups → Download JSON backup** to save your entire workspace as one `.json` file.
- Transfer that JSON file to another computer. Open SiteLedger there and choose **Settings & backups → Choose JSON file**. Inspect the preview and type **RESTORE** to replace the destination browser's existing data with the backup.
- The backup includes all projects, client names, expenses, dates, notes, and business settings.
- **Restore replaces** the data in that browser. Download its current backup first if you need both copies. It does not merge two different sets of accounts.
- You can also download **CSV** reports from the All expenses page and the options menu on an individual project. CSV exports are for spreadsheets; **JSON is the full restorable backup**.

## Deletion safeguards

- There is no one-click delete.
- To delete one expense, open its **Edit** dialog and choose **Delete...**.
- To delete a project (including its linked expenses), go to that project and use **⋯ → Delete project**.
- To delete everything, use **Settings & backups → Danger zone**.
- **Every deletion requires typing `DELETE` or `ERASE`**, then confirming. Deleting is irreversible without a backup.

## Where is the data saved?

All user data is saved in the browser's **localStorage** under the key `siteledger.v1.data`.

**Important:** Data belongs to that browser, website origin, and device, not the extracted folder. Clearing browser/site data, switching browsers, using private browsing, or changing the hosting URL can make records inaccessible. There is no automatic cross-device sync. Always export regular JSON backups to a safe place.

For reliable usage on one computer, keep using the **same browser and URL** (for example `http://localhost:5500`). Do not change ports or URLs casually without exporting your backup.

## Optional: hosting and installation

The app is static and can be deployed to GitHub Pages, Netlify, an HTTPS-enabled AWS S3 + CloudFront site, or any standard static web host. **No server-side app is required.** Make sure the site is opened at a consistent HTTPS URL, as localStorage is saved per origin. Different browsers or devices still require JSON backup and restore.

A `manifest.webmanifest` and service worker are included. On compatible browsers, when served over HTTPS or localhost, the app can be installed like a PWA and its static files can work offline after the first successful load. **Offline installability does not add syncing or cloud storage.**

## Project files

- `index.html` — App shell and icons
- `styles.css` — Responsive interface
- `app.js` — Client/project management, expense sorting, localStorage, exports, imports, and confirmation dialogs
- `manifest.webmanifest` — PWA configuration
- `sw.js` — Static offline cache
- `assets/` — SiteLedger icons

## Browser support

Latest Chrome, Edge, Firefox, or Safari recommended. JavaScript and browser storage must be enabled.
