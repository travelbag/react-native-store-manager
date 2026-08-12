import { showAppDialog } from '../context/DialogContext';

export const isNoRacksAvailableError = (errorOrResult) => {
  const code = String(errorOrResult?.code || errorOrResult?.error || '').toLowerCase();
  const message = String(errorOrResult?.message || errorOrResult || '').toLowerCase();
  return (
    code === 'no_racks_available' ||
    message.includes('no racks available') ||
    message.includes('no pack-out')
  );
};

export const resolveAssignedPackoutRack = (result) =>
  String(
    result?.packageRack ||
      result?.rackNumber ||
      result?.rack_number ||
      result?.rackAutoAssign?.seedOrderRack ||
      result?.seedOrderRack ||
      ''
  )
    .trim()
    .toUpperCase();

export const showPackoutRackAssignedDialog = (rackNumber) =>
  showAppDialog(
    'Place this packed order',
    'Put the packed bag on this rack so the driver can pick it up. This slot is reserved for this order only.',
    [{ text: 'Got it' }],
    {
      variant: 'success',
      icon: 'file-tray',
      cancelable: false,
      highlight: {
        type: 'rack',
        label: 'Assigned rack',
        value: rackNumber,
      },
    }
  );

export const showNoPackoutRacksDialog = () =>
  showAppDialog(
    'No racks available',
    'All pack-out slots A1–E10 are in use. Wait until a driver picks up an order and frees a rack, then mark this order ready again.',
    [{ text: 'OK' }],
    {
      variant: 'warning',
      icon: 'file-tray-outline',
      cancelable: false,
    }
  );
