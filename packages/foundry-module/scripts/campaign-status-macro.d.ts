/**
 * Get current status from toggle element classes
 */
declare function getCurrentStatus(
  element: any
): 'not_started' | 'in_progress' | 'completed' | 'skipped';
/**
 * Get next status in cycle
 */
declare function getNextStatus(current: any): string;
/**
 * Update toggle visual appearance
 */
declare function updateToggleVisual(element: any, newStatus: any): void;
/**
 * Get status icon
 */
declare function getStatusIcon(status: any): any;
/**
 * Format status for display
 */
declare function formatStatus(status: any): any;
//# sourceMappingURL=campaign-status-macro.d.ts.map
