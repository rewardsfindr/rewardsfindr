// ─────────────────────────────────────────────
// POPUP SCRIPT
// Runs only when user clicks the extension icon
// Never handles auth or DB directly — always asks background via messages
// Three states: loading → signedout → signedin
// ─────────────────────────────────────────────

// ── DOM References ──────────────────────────
const stateLoading  = document.getElementById('state-loading');
const stateSignedOut = document.getElementById('state-signedout');
const stateSignedIn  = document.getElementById('state-signedin');
const btnSignIn      = document.getElementById('btn-signin');
const btnSignOut     = document.getElementById('btn-signout');
const userEmail      = document.getElementById('user-email');
const cardList       = document.getElementById('card-list');
const emptyState     = document.getElementById('empty-state');

// ── State Management ─────────────────────────
// Only one state visible at a time — hide all, show one
const showState = (stateEl) => {
  [stateLoading, stateSignedOut, stateSignedIn].forEach(el => {
    el.classList.remove('active');
  });
  stateEl.classList.add('active');
};

// ── Card List Renderer ───────────────────────
// Renders synced cards with offer count and sync status
const renderCards = (cards) => {
  cardList.innerHTML = '';

  if (!cards?.length) {
    emptyState.style.display = 'block';
    cardList.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  cardList.style.display = 'flex';

  cards.forEach(card => {
    const row = document.createElement('div');
    row.className = 'card-row';

    // Format last synced time
    const lastSynced = card.lastSynced
      ? formatTimeAgo(new Date(card.lastSynced))
      : 'Never';

    // Format card name from slug: chase_freedom_flex → Chase Freedom Flex
    const displayName = card.cardId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Badge based on sync status
    const badgeClass = card.syncStatus === 'success'
      ? 'badge-success'
      : card.syncStatus === 'failed'
      ? 'badge-failed'
      : 'badge-pending';

    const badgeText = card.syncStatus === 'success'
      ? `${card.offerCount} offers`
      : card.syncStatus === 'failed'
      ? 'Failed'
      : 'Pending';

    row.innerHTML = `
      <div class="card-info">
        <div class="card-name">${displayName}</div>
        <div class="card-meta">Last synced: ${lastSynced}</div>
      </div>
      <span class="card-badge ${badgeClass}">${badgeText}</span>
    `;

    cardList.appendChild(row);
  });
};

// ── Time Formatter ───────────────────────────
// "2 hrs ago", "Just now", "3 days ago"
// Keeps the UI human-readable without a date library
const formatTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60)   return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hrs ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
};

// ── Init ─────────────────────────────────────
// On popup open: check auth state, then render appropriate state
const init = () => {
  showState(stateLoading);

  chrome.runtime.sendMessage({ type: 'GET_USER' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Popup] GET_USER error:', chrome.runtime.lastError);
      showState(stateSignedOut);
      return;
    }

    if (!response?.user) {
      showState(stateSignedOut);
      return;
    }

    // User is signed in — show their email and sync status
    userEmail.textContent = response.user.email;

    chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, (syncResponse) => {
      if (chrome.runtime.lastError) {
        console.error('[Popup] GET_SYNC_STATUS error:', chrome.runtime.lastError);
        renderCards([]);
      } else {
        renderCards(syncResponse?.cards || []);
      }
      showState(stateSignedIn);
    });
  });
};

// ── Sign In ───────────────────────────────────
btnSignIn.addEventListener('click', () => {
  btnSignIn.disabled = true;
  btnSignIn.textContent = 'Signing in…';

  chrome.runtime.sendMessage({ type: 'SIGN_IN' }, (response) => {
    if (chrome.runtime.lastError || !response?.user) {
      console.error('[Popup] Sign in failed:', chrome.runtime.lastError);
      btnSignIn.disabled = false;
      btnSignIn.textContent = 'Sign in with Google';
      return;
    }

    // Signed in successfully — re-init to show signed-in state
    init();
  });
});

// ── Sign Out ──────────────────────────────────
btnSignOut.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => {
    showState(stateSignedOut);
  });
});

// ── Boot ──────────────────────────────────────
// Small delay ensures background service worker is ready
// before popup tries to message it
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(init, 100);
});
