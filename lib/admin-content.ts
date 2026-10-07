// Date inputs describe a calendar day in the administrator's local timezone.
// UTC ISO dates otherwise show yesterday during the first hours of the day.
export function localContentDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
