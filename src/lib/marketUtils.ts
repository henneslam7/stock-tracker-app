export function getMarketStatus() {
  const now = new Date();
  
  // US Market (9:30 AM - 4:00 PM ET, Mon-Fri)
  const usTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'long'
  }).formatToParts(now);
  
  const usHour = parseInt(usTime.find(p => p.type === 'hour')?.value || '0');
  const usMinute = parseInt(usTime.find(p => p.type === 'minute')?.value || '0');
  const usDay = usTime.find(p => p.type === 'weekday')?.value || '';
  const isUSWeekend = usDay === 'Saturday' || usDay === 'Sunday';
  const usTotalMinutes = usHour * 60 + usMinute;
  const isUSOpen = !isUSWeekend && usTotalMinutes >= (9 * 60 + 30) && usTotalMinutes < (16 * 60);

  // HK Market (9:30 AM - 12:00 PM, 1:00 PM - 4:00 PM HKT, Mon-Fri)
  const hkTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Hong_Kong',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'long'
  }).formatToParts(now);
  
  const hkHour = parseInt(hkTime.find(p => p.type === 'hour')?.value || '0');
  const hkMinute = parseInt(hkTime.find(p => p.type === 'minute')?.value || '0');
  const hkDay = hkTime.find(p => p.type === 'weekday')?.value || '';
  const isHKWeekend = hkDay === 'Saturday' || hkDay === 'Sunday';
  const hkTotalMinutes = hkHour * 60 + hkMinute;
  const isHKOpen = !isHKWeekend && (
    (hkTotalMinutes >= (9 * 60 + 30) && hkTotalMinutes < (12 * 60)) ||
    (hkTotalMinutes >= (13 * 60) && hkTotalMinutes < (16 * 60))
  );

  return { 
    us: isUSOpen ? 'Open' : 'Closed', 
    hk: isHKOpen ? 'Open' : 'Closed' 
  };
}
