// api/calendar.js — Génère un flux iCalendar (.ics) des installations planifiées
// S'abonner depuis iPhone: Réglages > Calendrier > Comptes > Ajouter un abonnement

module.exports = async function handler(req, res) {
  const KV_URL   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // Lire les installations planifiées depuis KV
  let events = [];
  try {
    const r = await fetch(`${KV_URL}/get/irve_planning`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const json = await r.json();
    if (json.result) {
      const raw = json.result;
      events = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(events)) events = [];
    }
  } catch(e) { events = []; }

  // Fonctions de formatage iCal
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = (dateStr, timeStr) => {
    // dateStr = "2026-06-15", timeStr = "09:00"
    const d = dateStr.replace(/-/g, '');
    const t = (timeStr || '09:00').replace(/:/g, '') + '00';
    return d + 'T' + t;
  };
  const esc = s => String(s || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');

  const now = new Date();
  const stamp = now.getUTCFullYear() + pad(now.getUTCMonth()+1) + pad(now.getUTCDate()) + 'T' +
                pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

  let ics = 'BEGIN:VCALENDAR\r\n';
  ics += 'VERSION:2.0\r\n';
  ics += 'PRODID:-//VoltExpert//Planning IRVE//FR\r\n';
  ics += 'CALSCALE:GREGORIAN\r\n';
  ics += 'METHOD:PUBLISH\r\n';
  ics += 'X-WR-CALNAME:Installations IRVE\r\n';
  ics += 'X-WR-TIMEZONE:Europe/Paris\r\n';

  events.forEach(ev => {
    const duree = parseInt(ev.duree) || 4; // heures
    const startDT = fmtDate(ev.date, ev.heure);
    // Calculer l'heure de fin
    const [h, m] = (ev.heure || '09:00').split(':').map(Number);
    const endH = h + duree;
    const endDT = fmtDate(ev.date, pad(endH) + ':' + pad(m||0));

    const desc = [
      'CLIENT: ' + (ev.nom || '-'),
      'TEL: ' + (ev.tel || '-'),
      'ADRESSE: ' + (ev.adresse || '-'),
      'BORNE: ' + (ev.borne || '-'),
      'TRAVAUX: ' + (ev.travaux || '-'),
      ev.montant ? 'MONTANT: ' + ev.montant + ' EUR' : '',
      ev.notes ? 'NOTES: ' + ev.notes : '',
    ].filter(Boolean).join('\\n');

    ics += 'BEGIN:VEVENT\r\n';
    ics += 'UID:' + (ev.id || Date.now()) + '@voltexpert\r\n';
    ics += 'DTSTAMP:' + stamp + '\r\n';
    ics += 'DTSTART;TZID=Europe/Paris:' + startDT + '\r\n';
    ics += 'DTEND;TZID=Europe/Paris:' + endDT + '\r\n';
    ics += 'SUMMARY:' + esc('🔌 ' + (ev.nom || 'Installation') + ' - ' + (ev.borne || 'IRVE')) + '\r\n';
    ics += 'LOCATION:' + esc(ev.adresse || '') + '\r\n';
    ics += 'DESCRIPTION:' + esc(desc) + '\r\n';
    if (ev.tel) ics += 'CONTACT:' + esc(ev.tel) + '\r\n';
    ics += 'STATUS:CONFIRMED\r\n';
    // Rappel 1h avant
    ics += 'BEGIN:VALARM\r\nTRIGGER:-PT1H\r\nACTION:DISPLAY\r\nDESCRIPTION:Installation IRVE dans 1h\r\nEND:VALARM\r\n';
    ics += 'END:VEVENT\r\n';
  });

  ics += 'END:VCALENDAR\r\n';

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="planning-irve.ics"');
  res.setHeader('Cache-Control', 'no-cache, max-age=300');
  return res.status(200).send(ics);
};
