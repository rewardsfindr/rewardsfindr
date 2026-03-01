// ─────────────────────────────────────────────
// CHASE CONTENT SCRIPT
// Runs automatically when user visits chase.com offers page
// Parses offer cards from the DOM and sends to background
// Never writes to DB directly — always via background message
// ─────────────────────────────────────────────

// ── Constants ────────────────────────────────
const BANK = 'chase';
const PARSE_DELAY_MS = 3000; // Chase renders offers via React — wait for DOM to settle

// ── Category Inference ───────────────────────
// Chase doesn't always label categories explicitly
// We infer from merchant name keywords as fallback
const inferCategory = (merchantName) => {
  const name = merchantName.toLowerCase();

  if (/restaurant|cafe|coffee|starbucks|mcdonald|chipotle|pizza|sushi|grill|diner|bistro|burger|taco|subway|panera/.test(name)) {
    return 'dining';
  }
  if (/grocery|supermarket|whole foods|trader joe|kroger|safeway|wegmans|publix|aldi|costco|walmart|target/.test(name)) {
    return 'grocery';
  }
  if (/shell|bp|chevron|exxon|mobil|gas|fuel|citgo|marathon|sunoco/.test(name)) {
    return 'gas';
  }
  if (/cvs|walgreens|rite aid|pharmacy|drugstore/.test(name)) {
    return 'drugstore';
  }
  if (/hotel|airlines|flights|marriott|hilton|hyatt|united|delta|american airlines|airbnb|expedia/.test(name)) {
    return 'travel';
  }
  if (/amazon|best buy|nike|apple|walmart\.com|target\.com|ebay|etsy/.test(name)) {
    return 'shopping';
  }
  if (/netflix|spotify|hulu|disney|apple tv|youtube|amazon prime/.test(name)) {
    return 'subscription';
  }

  return 'other';
};

// ── Parse Cashback Amount ─────────────────────
// Handles formats: "$10 back", "10% back", "5% cash back"
// Returns { cashbackAmount, cashbackType }
const parseCashback = (text) => {
  if (!text) return { cashbackAmount: 0, cashbackType: 'fixed' };

  // Percent format: "5% back", "30% cash back"
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return {
      cashbackAmount: parseFloat(percentMatch[1]),
      cashbackType: 'percent',
    };
  }

  // Fixed format: "$10 back", "$10 statement credit"
  const fixedMatch = text.match(/\$(\d+(?:\.\d+)?)/);
  if (fixedMatch) {
    return {
      cashbackAmount: parseFloat(fixedMatch[1]),
      cashbackType: 'fixed',
    };
  }

  return { cashbackAmount: 0, cashbackType: 'fixed' };
};

// ── Detect Card Name ──────────────────────────
// Chase shows card nickname in page title or account switcher
// Falls back to generic "Chase Card" if not detectable
const detectCardName = () => {
  // Try account switcher dropdown first
  const accountEl = document.querySelector('[data-testid="account-display-name"]')
    || document.querySelector('.account-name')
    || document.querySelector('[class*="accountName"]');

  if (accountEl?.textContent?.trim()) {
    return accountEl.textContent.trim();
  }

  // Try page heading
  const headingEl = document.querySelector('h1');
  if (headingEl?.textContent?.includes('Freedom') ||
      headingEl?.textContent?.includes('Sapphire') ||
      headingEl?.textContent?.includes('Ink')) {
    return headingEl.textContent.trim();
  }

  return 'Chase Card';
};

// ── Main Parser ───────────────────────────────
// Chase renders offers as cards in a grid
// Each offer card contains merchant name, offer description
const parseChaseOffers = () => {
  const offers = [];

  // New Chase DOM structure (2024+)
  const offerCards = document.querySelectorAll('[data-testid="offer-tile-grid-item-container"]');

  console.log(`[RewardsFindr] Found ${offerCards.length} offer elements on Chase page`);

  if (!offerCards.length) {
    console.warn('[RewardsFindr] No offer cards found — Chase may have updated their DOM');
    return [];
  }

  offerCards.forEach((card, index) => {
    try {
      // Merchant name - in the span with class containing "semanticColorTextRegular"
      const merchantEl = card.querySelector('.mds-body-small-heavier');
      const merchantName = merchantEl?.textContent?.trim();
      
      if (!merchantName) {
        console.warn(`[RewardsFindr] Skipping offer ${index} — no merchant name found`);
        return;
      }

      // Offer description (cashback amount) - in the larger text
      const descEl = card.querySelector('.mds-body-large-heavier');
      const description = descEl?.textContent?.trim() || '';
      const { cashbackAmount, cashbackType } = parseCashback(description);

      // Check if already activated (button shows plus icon = not activated)
      const addButton = card.querySelector('svg');
      const isActivated = !addButton; // If no add button, already activated

      // Infer category from merchant name
      const category = inferCategory(merchantName);

      // No expiry date visible in this DOM structure
      const expiryDate = null;

      offers.push({
        merchantName,
        offerDescription: description,
        cashbackAmount,
        cashbackType,
        minimumSpend: 0, // Not visible in this structure
        expiryDate,
        category,
        isActivated,
        cardElement: card, // Store reference for activation
      });

    } catch (e) {
      console.error(`[RewardsFindr] Error parsing offer card ${index}:`, e);
    }
  });

  console.log(`[RewardsFindr] Successfully parsed ${offers.length} Chase offers`);
  return offers;
};

// ── Send to Background ────────────────────────
const syncOffers = (cardName, offers) => {
  chrome.runtime.sendMessage(
    {
      type: 'OFFERS_PARSED',
      payload: { bank: BANK, cardName, offers },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[RewardsFindr] Message error:', chrome.runtime.lastError);
        return;
      }
      if (response?.success) {
        console.log(`[RewardsFindr] ✓ Chase sync complete — ${response.synced} offers written`);
      } else {
        console.warn('[RewardsFindr] ✗ Chase sync failed:', response?.reason);
      }
    }
  );
};

// ── Activate All Offers ───────────────────────
const activateAllOffers = async (offers) => {
  const unactivatedOffers = offers.filter(o => !o.isActivated && o.cardElement);
  
  if (unactivatedOffers.length === 0) {
    alert('All offers are already activated! ✓');
    return;
  }

  console.log(`[RewardsFindr] Activating ${unactivatedOffers.length} offers...`);
  
  let activated = 0;
  let failed = 0;

  for (const offer of unactivatedOffers) {
    try {
      // Find the clickable tile
      const tile = offer.cardElement.querySelector('[data-testid="commerce-tile"]');
      
      if (!tile) {
        failed++;
        continue;
      }
      
      // Scroll into view
      tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Wait for scroll
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Click the tile
      tile.click();
      
      // Wait for activation
      await new Promise(resolve => setTimeout(resolve, 800));
      
      activated++;
      console.log(`[RewardsFindr] ✓ Activated: ${offer.merchantName}`);
      
    } catch (e) {
      failed++;
      console.error(`[RewardsFindr] ✗ Failed to activate: ${offer.merchantName}`, e);
    }
  }

  alert(`Activation complete!\n✓ Activated: ${activated}\n✗ Failed: ${failed}`);
};

// ── Create Floating Button ────────────────────
const createFloatingButton = (offers) => {
  // Remove existing button if any
  const existing = document.getElementById('rewardsfindr-activate-btn');
  if (existing) existing.remove();

  // Count unactivated offers
  const unactivatedCount = offers.filter(o => !o.isActivated && o.cardElement).length;
  
  if (unactivatedCount === 0) {
    console.log('[RewardsFindr] All offers already activated — not showing button');
    return;
  }

  // Create button
  const button = document.createElement('button');
  button.id = 'rewardsfindr-activate-btn';
  button.innerHTML = `
    <span style="font-size: 18px; margin-right: 6px;">⚡</span>
    <span>Activate All (${unactivatedCount})</span>
  `;
  
  // Styles
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '999999',
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  });

  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 12px 24px rgba(79, 70, 229, 0.4), 0 4px 8px rgba(0, 0, 0, 0.15)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 8px 16px rgba(79, 70, 229, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)';
  });

  // Click handler
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';
    button.innerHTML = '<span style="font-size: 18px;">⏳</span> <span>Activating...</span>';
    
    await activateAllOffers(offers);
    
    // Refresh offers after activation
    setTimeout(() => {
      button.remove();
      boot(); // Re-run to update counts
    }, 1000);
  });

  document.body.appendChild(button);
  console.log(`[RewardsFindr] ✓ Floating button added (${unactivatedCount} offers)`);
};

// ── Boot ──────────────────────────────────────
const boot = () => {
  console.log('[RewardsFindr] Chase content script loaded — waiting for DOM…');

  setTimeout(() => {
    const cardName = detectCardName();
    console.log(`[RewardsFindr] Detected card: ${cardName}`);

    const offers = parseChaseOffers();

    if (offers.length > 0) {
      syncOffers(cardName, offers);
      createFloatingButton(offers);
    } else {
      console.warn('[RewardsFindr] No offers parsed — skipping sync');
    }
  }, PARSE_DELAY_MS);
};

boot();
