import { confirmAppDialog } from '../context/DialogContext';
import { formatInventoryExpiryDisplay } from './inventoryExpiry';

/**
 * Confirmation shown when a picked unit is close to expiry.
 * Resolves true when the picker chooses to continue with the unit.
 */
export const confirmExpiringSoonPick = ({ productName, expiryValue, alert } = {}) => {
  const name = String(productName || '').trim() || 'This product';
  const daysRemaining = alert?.daysRemaining;
  const countdown = alert?.label || 'Expiring soon';
  // Two days or less is effectively unsellable, so make it read as a hard stop.
  const urgent = typeof daysRemaining === 'number' && daysRemaining <= 2;

  return confirmAppDialog({
    title: urgent ? 'Expires very soon' : 'Expiry warning',
    message: `${name} is close to its expiry date. Check the label before you pick this unit.`,
    variant: urgent ? 'error' : 'warning',
    icon: 'time',
    highlight: {
      icon: 'hourglass-outline',
      label: 'Time remaining',
      value: countdown,
    },
    details: [
      { label: 'Product', value: name, icon: 'cube-outline' },
      expiryValue
        ? {
            label: 'Expiry date',
            value: formatInventoryExpiryDisplay(expiryValue),
            icon: 'calendar-outline',
          }
        : null,
    ].filter(Boolean),
    confirmText: 'Pick anyway',
    cancelText: 'Skip this unit',
    cancelable: false,
  });
};
