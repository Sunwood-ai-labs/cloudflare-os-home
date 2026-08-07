const VENDOR_ICON_BACKGROUNDS: Record<string, string> = {
  slack: '#f4ecf5',
  discord: '#eef0ff',
  jira: '#e6efff',
  google: '#e8f0fe',
  github: '#f0f0f0',
  notion: '#f5f5f5',
  linear: '#eeeffa',
  figma: '#fef0ec',
}

const VENDOR_ICON_DARK_BACKGROUNDS: Record<string, string> = {
  slack: '#d8c4db',
  discord: '#c9cef7',
  jira: '#c4d8f7',
  google: '#c9d8f2',
  github: '#d6d6d6',
  notion: '#dadada',
  linear: '#cfd1ea',
  figma: '#f0cfc5',
}

export function getVendorIconBackground(vendorId: string, mode: 'light' | 'dark'): string {
  const key = vendorId.toLowerCase()

  if (mode === 'dark') {
    return VENDOR_ICON_DARK_BACKGROUNDS[key] ?? '#cad5f0'
  }

  return VENDOR_ICON_BACKGROUNDS[key] ?? '#f0f4ff'
}
