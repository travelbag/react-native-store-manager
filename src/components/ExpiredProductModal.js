import React, { useEffect } from 'react';

/**
 * Legacy blocking modal — disabled.
 * Auto-dismisses so any leftover caller cannot stop picking.
 */
const ExpiredProductModal = ({ visible, onExpiryUpdated, onPickAnother }) => {
  useEffect(() => {
    if (!visible) return undefined;
    const t = setTimeout(() => {
      onExpiryUpdated?.();
    }, 0);
    return () => clearTimeout(t);
  }, [visible, onExpiryUpdated, onPickAnother]);

  return null;
};

export default ExpiredProductModal;
