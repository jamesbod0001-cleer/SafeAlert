/** SafeAlert app module — Toast + formatting */
/* eslint-disable */
function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function toast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('toast-ok', 'toast-err');
  if (kind === 'ok') el.classList.add('toast-ok');
  if (kind === 'err') el.classList.add('toast-err');
  el.classList.add('show');
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => el.classList.remove('show', 'toast-ok', 'toast-err'), 4000);
}
