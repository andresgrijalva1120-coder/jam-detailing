# Connect website bookings to Google Calendar

1. On a computer, go to https://script.google.com signed in as jamdetailingaz@gmail.com and click **New project**.
2. Delete the sample code, paste in everything from `Code.gs` in this folder, and click the save icon. Name the project "JAM Bookings".
3. Top right: **Deploy > New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then **Authorize access**, pick your account. If you see "Google hasn't verified this app", click **Advanced > Go to JAM Bookings (unsafe)** (it's your own script) and **Allow**.
5. Copy the **Web app URL** (ends in `/exec`).
6. In `assets/config.js`, paste it between the quotes in `var JAM_CALENDAR_URL = '';`

Optional check: in the script editor pick `testBooking` in the function menu and click **Run**. A test event appears on your calendar tomorrow at 4 PM. Delete it afterwards.

To change how long each package blocks your calendar, edit `PACKAGE_HOURS` in the script (then Deploy > Manage deployments > edit > New version) and `JAM_PACKAGE_HOURS` in `assets/config.js`.

## Updating the script later

Paste the new code over the old (Ctrl+A, Delete, Ctrl+V), save, then **Deploy > Manage deployments**, click the pencil, set **Version: New version**, and **Deploy**. The URL stays the same. If Google asks for new permissions (for example to send email), approve them; use an InPrivate window if you're signed into several Google accounts.
