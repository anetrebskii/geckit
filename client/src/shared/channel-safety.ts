const SECRET = /\b(?:xox[abposr]-[\w-]{10,}|xapp-[\w-]{10,}|sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|[MNO][\w-]{23,27}\.[\w-]{6}\.[\w-]{27,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

export const containsSecret = (text: string): boolean => SECRET.test(text)
