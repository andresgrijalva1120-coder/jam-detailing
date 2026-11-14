/**
 * JAM Detailing: website bookings -> Google Calendar
 *
 * Paste this whole file into your Google Apps Script project (script.google.com),
 * then Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *
 * What it does:
 *  - When someone sends the booking form, it adds an event to your Google Calendar
 *    and emails the customer (if they gave an email) their booking code and cancel link.
 *  - The website asks it which times are already taken on a day, so booked slots get grayed out.
 *    Only start/end times are shared with the website, never names or details.
 *  - Customers can cancel online until 24 hours before. The event is removed and you get an email.
 */

// ---- Settings you can change ----
var TIME_ZONE = 'America/Phoenix';
var CALENDAR_ID = 'primary';          // 'primary' = your main Google Calendar
var CANCEL_CUTOFF_HOURS = 24;         // online cancelling closes this many hours before the appointment
var BUSINESS_PHONE = '(520) 000-0000';
var SITE = 'https://jamdetailingaz.com';
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
function digits_(s) { return String(s || '').replace(/\D/g, '').slice(-10); }
function cleanCode_(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }

function startOf_(ev) { return ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime(); }

function whenText_(ev) {
  return ev.isAllDayEvent()
    ? Utilities.formatDate(ev.getAllDayStartDate(), TIME_ZONE, 'EEEE, MMMM d') + ' (time to be set)'
    : Utilities.formatDate(ev.getStartTime(), TIME_ZONE, "EEEE, MMMM d 'at' h:mm a");
}

// Website asks:
//   ?date=2026-11-20                         -> which times are taken that day
//   ?action=cancel&code=AB12CD34             -> cancel by booking code
//   ?action=cancel&phone=5205551234&date=... -> cancel by phone number + appointment date
//   ?action=status&code=AB12CD34             -> is this booking still on the calendar? (lets the site unlock the form)
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'cancel') return json_(cancel_(p));
  if (p.action === 'status') return json_({ exists: cleanCode_(p.code) ? !!findBooking_({ code: p.code }) : null });

  if (!validDate_(p.date)) return json_({ error: 'bad date' });
  var start = Utilities.parseDate(p.date + ' 00:00', TIME_ZONE, 'yyyy-MM-dd HH:mm');
  var end = new Date(start.getTime() + 24 * 3600 * 1000);
  var busy = calendar_().getEvents(start, end).map(function (ev) {
    if (ev.isAllDayEvent()) return null;   // all-day notes (like "flexible time" requests) don't block slots
    var s = Math.max(0, (ev.getStartTime() - start) / 60000);
    var f = Math.min(1440, (ev.getEndTime() - start) / 60000);
    return [Math.round(s), Math.round(f)];
  }).filter(Boolean);
  return json_({ busy: busy });
}

// Finds the customer's booking by code, or by phone number + date.
function findBooking_(p) {
  var cal = calendar_();
  var code = cleanCode_(p.code);
  if (code) {
    var from = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    var to = new Date(Date.now() + 400 * 24 * 3600 * 1000);
    var all = cal.getEvents(from, to);
    for (var i = 0; i < all.length; i++) if (all[i].getTag('jam_code') === code) return all[i];
    return null;
  }
  var phone = digits_(p.phone);
  if (phone.length < 7 || !validDate_(p.date)) return null;
  var dayStart = Utilities.parseDate(p.date + ' 00:00', TIME_ZONE, 'yyyy-MM-dd HH:mm');
  var dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  var list = cal.getEvents(dayStart, dayEnd);
  for (var j = 0; j < list.length; j++) if (list[j].getTag('jam_phone') === phone) return list[j];
  return null;
}

function cancel_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ev = findBooking_(p);
    if (!ev) return { ok: false, reason: 'not_found' };
    var when = whenText_(ev);
    var hoursLeft = (startOf_(ev).getTime() - Date.now()) / 3600000;
    if (hoursLeft < CANCEL_CUTOFF_HOURS) return { ok: false, reason: 'too_late', when: when, phone: BUSINESS_PHONE };

    var title = ev.getTitle(), details = ev.getDescription(), email = ev.getTag('jam_email');
    ev.deleteEvent();
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        'Cancelled: ' + title.replace(/^[^A-Za-z]+/, '') + ' (' + when + ')',
        'A customer cancelled online. The appointment has been removed from your calendar.\n\nWas scheduled: ' + when + '\n\n' + details);
    } catch (err) {}
    if (email) {
      try {
        MailApp.sendEmail(email, 'Your JAM Detailing appointment is cancelled',
          'Your appointment for ' + when + ' has been cancelled.\n\nWant to rebook? ' + SITE + '/#book\n\nJAM Detailing · ' + BUSINESS_PHONE,
          { name: 'JAM Detailing' });
      } catch (err) {}
    }
    return { ok: true, when: when };
  } finally {
    lock.releaseLock();
  }
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
    var code = cleanCode_(p.booking_code);
    var service = String(p.service || 'Not sure yet');
    var pkg = service.replace(/\s*\(.*\)\s*$/, '');
    var title = '🧽 ' + pkg + ' – ' + p.name;
    var details = [
      'Booking request from jamdetailingaz.com',
      'Booking code: ' + (code || '—'),
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
    if (code) ev.setTag('jam_code', code);
    ev.setTag('jam_phone', digits_(p.phone));
    var email = String(p.email || '').trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      ev.setTag('jam_email', email);
      try {
        MailApp.sendEmail(email, 'We got your JAM Detailing booking request',
          'Hi ' + p.name + ',\n\nThanks for booking with JAM Detailing! We got your request for ' + whenText_(ev) + '.\n' +
          'We\'ll reach out soon to confirm.\n\n' +
          'Package: ' + service + '\nVehicle: ' + (p.vehicle || '—') + ' (' + (p.vehicle_size || '—') + ')\n' +
          'Add-ons: ' + (p.add_ons || 'None') + '\nEstimated total: ' + (p.estimated_total || '—') + '\n\n' +
          (code ? 'Your booking code: ' + code + '\nNeed to cancel? You can cancel online up to ' + CANCEL_CUTOFF_HOURS +
            ' hours before your appointment:\n' + SITE + '/cancel.html?code=' + code + '\n\n' : '') +
          'Within ' + CANCEL_CUTOFF_HOURS + ' hours of your appointment, please call or text ' + BUSINESS_PHONE + '.\n\nJAM Detailing',
          { name: 'JAM Detailing' });
      } catch (err) {}
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// Optional: run this from the editor to check it works. It adds a test event 3 days from now at 4 PM,
// then cancels it again by its code. Check View > Logs (or Execution log) for two {"ok":true} lines.
function testBooking() {
  var t = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  var date = Utilities.formatDate(t, TIME_ZONE, 'yyyy-MM-dd');
  var res = doPost({ parameter: { name: 'Test Customer', phone: '520-000-0000', date: date, time: '4:00 PM',
    service: 'The Full Jar Detail (from $140)', vehicle: '2019 Toyota Tacoma', vehicle_size: 'Truck',
    address: '123 Test St, Tucson, AZ', add_ons: 'Air Freshener (Mango)', estimated_total: 'From $170',
    booking_code: 'TEST1234' } });
  Logger.log(res.getContent());
  Logger.log(JSON.stringify(cancel_({ code: 'TEST1234' })));
}
