// Campaign Status Toggle Macro for Foundry VTT
// This macro needs to be run in Foundry VTT to enable interactive campaign status toggles
// Run this macro once when you start your game session

// Set up the hook to make campaign status toggles interactive
Hooks.on('renderJournalTextPageSheet', (sheet, html, data) => {
  console.log('[Campaign Status] Processing journal sheet for interactive toggles');

  // Identify the journal entry and page being rendered
  const page = sheet.object; // JournalEntryPage document
  const entry = page.parent; // parent JournalEntry document

  // Only process if this appears to be a campaign dashboard
  if (!entry.name?.includes('Campaign Dashboard')) {
    return;
  }

  console.log('[Campaign Status] Found campaign dashboard, setting up interactive toggles');

  // Load previously saved status flags (if any) for this entry
  const statusFlags = entry.getFlag('world', 'campaignStatus') || {};

  // Find all campaign status toggle elements
  const toggles = html.find('.campaign-status-toggle');
  console.log(`[Campaign Status] Found ${toggles.length} status toggle elements`);

  // Set initial state of each status toggle element based on saved flags
  toggles.each(function () {
    const element = $(this);
    const campaignId = element.data('campaign-id');
    const partId = element.data('part-id');

    if (!campaignId || !partId) {
      console.warn('[Campaign Status] Toggle missing data attributes:', this);
      return;
    }

    const flagKey = `${campaignId}-${partId}`;
    const savedStatus = statusFlags[flagKey];

    if (savedStatus) {
      // Update element to match saved status
      updateToggleVisual(element, savedStatus);
      console.log(`[Campaign Status] Restored status for ${partId}: ${savedStatus}`);
    }
  });

  // When a status toggle is clicked, update its state and save the change
  toggles.on('click', async event => {
    event.preventDefault();
    event.stopPropagation();

    const element = $(event.currentTarget);
    const campaignId = element.data('campaign-id');
    const partId = element.data('part-id');

    if (!campaignId || !partId) {
      console.warn('[Campaign Status] Click on toggle missing data attributes');
      return;
    }

    // Only allow GMs to modify campaign progress
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can modify campaign progress');
      return;
    }

    const flagKey = `${campaignId}-${partId}`;
    const currentStatus = getCurrentStatus(element);
    const nextStatus = getNextStatus(currentStatus);

    console.log(`[Campaign Status] Cycling ${partId}: ${currentStatus} → ${nextStatus}`);

    // Update visual immediately for responsiveness
    updateToggleVisual(element, nextStatus);

    // Update the flags object
    statusFlags[flagKey] = nextStatus;

    try {
      // Persist the new state in the journal entry's flags
      await entry.setFlag('world', 'campaignStatus', statusFlags);

      // Show success notification
      const statusDisplay = formatStatus(nextStatus);
      ui.notifications.info(`Campaign progress updated: ${partId} is now ${statusDisplay}`);

      console.log(`[Campaign Status] Saved status for ${partId}: ${nextStatus}`);
    } catch (error) {
      console.error('[Campaign Status] Failed to save status:', error);
      ui.notifications.error('Failed to save campaign progress');

      // Revert visual change on error
      updateToggleVisual(element, currentStatus);
    }
  });
});

/**
 * Get current status from toggle element classes
 */
function getCurrentStatus(element) {
  if (element.hasClass('not-started')) return 'not_started';
  if (element.hasClass('in-progress')) return 'in_progress';
  if (element.hasClass('completed')) return 'completed';
  if (element.hasClass('skipped')) return 'skipped';
  return 'not_started'; // default
}

/**
 * Get next status in cycle
 */
function getNextStatus(current) {
  const cycle = ['not_started', 'in_progress', 'completed', 'skipped'];
  const currentIndex = cycle.indexOf(current);
  const nextIndex = (currentIndex + 1) % cycle.length;
  return cycle[nextIndex];
}

/**
 * Update toggle visual appearance
 */
function updateToggleVisual(element, newStatus) {
  // Remove all status classes
  element.removeClass('not-started in-progress completed skipped');

  // Add new status class
  const cssClass = newStatus.replace('_', '-');
  element.addClass(cssClass);

  // Update icon and text
  const statusIcon = getStatusIcon(newStatus);
  const statusDisplay = formatStatus(newStatus);

  element.html(`${statusIcon} ${statusDisplay}`);
  element.attr('title', `Click to change status: ${statusDisplay}`);
}

/**
 * Get status icon
 */
function getStatusIcon(status) {
  const icons = {
    not_started: '⚪',
    in_progress: '🔄',
    completed: '✅',
    skipped: '⏭️',
  };
  return icons[status] || '❓';
}

/**
 * Format status for display
 */
function formatStatus(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

console.log('[Campaign Status] Interactive toggle macro loaded and ready!');
