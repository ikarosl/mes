export const OTHER_INBOUND_CREATE_SCOPE = 'inventory.other-inbound.create.v2' as const;
export const OTHER_INBOUND_SAVE_SCOPE = 'inventory.other-inbound.save.v2' as const;
export const OTHER_INBOUND_CONFIRM_SCOPE = 'inventory.other-inbound.confirm.v2' as const;
export const OTHER_INBOUND_CANCEL_SCOPE = 'inventory.other-inbound.cancel.v2' as const;
export const OTHER_OUTBOUND_CREATE_SCOPE = 'inventory.other-outbound.create.v2' as const;
export const OTHER_OUTBOUND_SAVE_SCOPE = 'inventory.other-outbound.save.v2' as const;
export const OTHER_OUTBOUND_CONFIRM_SCOPE = 'inventory.other-outbound.confirm.v2' as const;
export const OTHER_OUTBOUND_CANCEL_SCOPE = 'inventory.other-outbound.cancel.v2' as const;
export const OTHER_INVENTORY_SCOPES = {
  inbound: {
    create: OTHER_INBOUND_CREATE_SCOPE,
    save: OTHER_INBOUND_SAVE_SCOPE,
    confirm: OTHER_INBOUND_CONFIRM_SCOPE,
    cancel: OTHER_INBOUND_CANCEL_SCOPE,
  },
  outbound: {
    create: OTHER_OUTBOUND_CREATE_SCOPE,
    save: OTHER_OUTBOUND_SAVE_SCOPE,
    confirm: OTHER_OUTBOUND_CONFIRM_SCOPE,
    cancel: OTHER_OUTBOUND_CANCEL_SCOPE,
  },
} as const;
