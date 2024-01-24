export const IsMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
export const CmdOrCtrl = IsMac ? 'Cmd' : 'Ctrl';
