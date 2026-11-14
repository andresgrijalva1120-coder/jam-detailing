/**
 * JAM Detailing: website bookings -> Google Calendar
 *
 * Paste this whole file into a Google Apps Script project (script.google.com),
 * then Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 *
 * What it does:
 *  - When someone sends the booking form, it adds an event to your Google Calendar.
 *  - The website asks it which times are already taken on a day, so booked slots get grayed out.
 *    Only start/end times are shared with the website, never names or details.
 */

// ---- Settings you can change ----
var TIME_ZONE = 'America/Phoenix';
var CALENDAR_ID = 'primary';          // 'primary' = your main Google Calendar
var DEFAULT_HOURS = 3;                // used when the package isn't recognized
var PACKAGE_HOURS = {                 // how long each package blocks on your calendar
  'Raspberry Rinse': 1.5,
  'Sweet Jam Interior Refresh': 1.5,
  'Strawberry Shine Exterior Detail': 2,
  'Berry Clean Deluxe': 2.5,
  'The Full Jar Detail': 3,
  'The Grand Slam Jam': 4
};
// ---------------------------------

function calendar_() {
  return CALENDAR_ID === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CALENDAR_ID);
}

function hoursFor_(service) {
  for (var name in PACKAGE_HOURS) if (String(service || '').indexOf(name) === 0) return PACKAGE_HOURS[name];
  return DEFAULT_HOURS;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function validDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

// Website asks: which times are taken on this day?  ?date=2026-11-20
// Answers with minutes after midnight, e.g. {"busy":[[960,1080]]} = 4:00 PM to 6:00 PM.
function doGet(e) {
  var date = e && e.parameter && e.parameter.date;
  if (!validDate_(date)) return json_({ error: 'bad date' });
  var start = Utilities.parseDate(date + ' 00:00', TIME_ZONE, 'yyyy-MM-dd HH:mm');
  var end = new Date(start.getTime() + 24 * 3600 * 1000);
  var busy = calendar_().getEvents(start, end).map(function (ev) {
    if (ev.isAllDayEvent()) return null;   // all-day notes (like "flexible time" requests) don't block slots
    var s = Math.max(0, (ev.getStartTime() - start) / 60000);
    var f = Math.min(1440, (ev.getEndTime() - start) / 60000);
    return [Math.round(s), Math.round(f)];
  }).filter(Boolean);
  return json_({ busy: busy });
}

// Website sends a booking: create the calendar event.
function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.botcheck) return json_({ ok: false });              // spam bot filled the hidden box
  if (!p.name || !p.phone || !validDate_(p.date)) return json_({ ok: false, error: 'missing info' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                                      // two bookings at once won't trip over each other
  try {
    var cal = calendar_();
    var service = String(p.service || 'Not sure yet');
    var pkg = service.replace(/\s*\(.*\)\s*$/, '');
    var title = '🧽 ' + pkg + ' – ' + p.name;
    var details = [
      'Booking request from jamdetailingaz.com',
      '',
      'Name: ' + p.name,
      'Phone: ' + p.phone,
      'Email: ' + (p.email || '—'),
      'Address: ' + (p.address || '—'),
      '',
      'Vehicle: ' + (p.vehicle || '—'),
      'Size: ' + (p.vehicle_size || '—'),
      'Package: ' + service,
      'Add-ons: ' + (p.add_ons || 'None'),
      'Estimated total: ' + (p.estimated_total || '—'),
      '',
      'Preferred time: ' + (p.time || '—'),
      'Notes: ' + (p.notes || '—')
    ].join('\n');

    var opts = { description: details, location: p.address || '' };
    var m = String(p.time || '').match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
    var ev;
    if (m) {
      var start = Utilities.parseDate(p.date + ' ' + p.time, TIME_ZONE, 'yyyy-MM-dd h:mm a');
      var end = new Date(start.getTime() + hoursFor_(service) * 3600 * 1000);
      var clash = cal.getEvents(start, end).some(function (x) { return !x.isAllDayEvent(); });
      if (clash) title = '⚠️ DOUBLE-BOOKED ' + title;        // still saved so you never lose a customer
      ev = cal.createEvent(title, start, end, opts);
    } else {
      // "Flexible, any time works": all-day note so you can pick a time with them
      var day = Utilities.parseDate(p.date + ' 12:00', TIME_ZONE, 'yyyy-MM-dd HH:mm');
      ev = cal.createAllDayEvent('⏰ PICK A TIME · ' + title, day, opts);
    }
    ev.addPopupReminder(60);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// Optional: run this once from the editor to check it works. It adds a test event for tomorrow at 4 PM.
function testBooking() {
  var t = new Date(Date.now() + 24 * 3600 * 1000);
  var date = Utilities.formatDate(t, TIME_ZONE, 'yyyy-MM-dd');
  var res = doPost({ parameter: { name: 'Test Customer', phone: '520-000-0000', date: date, time: '4:00 PM',
    service: 'The Full Jar Detail (from $140)', vehicle: '2019 Toyota Tacoma', vehicle_size: 'Truck',
    address: '123 Test St, Tucson, AZ', add_ons: 'Air Freshener (Mango)', estimated_total: 'From $170' } });
  Logger.log(res.getContent());
}
