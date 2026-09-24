// The phone app and the Mac's hidden window both call from another origin.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

export const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { ...CORS, 'content-type': 'application/json' } })

export const ROOM = /^[0-9a-f]{64}$/
