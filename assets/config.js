// Shared settings for the website.
// Google Calendar connection. Paste the Web app URL from Google Apps Script between the quotes.
// Leave it empty and the site works exactly as before (email only, no calendar).
var JAM_CALENDAR_URL = 'https://script.google.com/macros/s/AKfycbwdzTQZANuX-eznsgqaC4Ogvb2su4_it_NopODmW4XxQOqHrMQPo1EGGujDi7HZoH7BmA/exec';
// How long each package blocks on the calendar, in hours. Keep in sync with PACKAGE_HOURS in calendar-setup/Code.gs.
var JAM_PACKAGE_HOURS = { 'Raspberry Rinse': 1.5, 'Sweet Jam Interior Refresh': 1.5, 'Strawberry Shine Exterior Detail': 2,
  'Berry Clean Deluxe': 2.5, 'The Full Jar Detail': 3, 'The Grand Slam Jam': 4 };
var JAM_DEFAULT_HOURS = 3;
