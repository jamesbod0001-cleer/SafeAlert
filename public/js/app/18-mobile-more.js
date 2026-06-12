/** SafeAlert — More sheet (Insights, Routes, Trust) for 4-tab mobile nav */
/* eslint-disable */

function openMoreSheet() {
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  document.getElementById('more-sheet')?.classList.add('show');
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  const moreBtn = document.getElementById('nb-more');
  moreBtn?.classList.add('active');
  moreBtn?.setAttribute('aria-selected', 'true');
}

function closeMoreSheet() {
  document.getElementById('more-sheet')?.classList.remove('show');
  if (!document.querySelector('.sheet.show')) {
    document.getElementById('sheet-bg')?.classList.remove('show');
  }
}

function moreGo(screen) {
  closeMoreSheet();
  closeSheets();
  go(screen);
}

function openSignInSheet() {
  openProfile('signin');
}

function openSettingsSheet() {
  openProfile('settings');
}
