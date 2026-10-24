import { describe, expect, it } from 'vitest'

import { askedEndpoint, endpointOnDisk, forwardSlashes } from '../src/cli/endpoint'

describe('where geckit start reaches the application', () => {
  it('is a socket file in the data folder, except on Windows', () => {
    expect(askedEndpoint('/Users/alex/Library/Application Support/geckit', 'darwin')).toBe('/Users/alex/Library/Application Support/geckit/geckit.sock')
    expect(endpointOnDisk('darwin')).toBe(true)
    expect(endpointOnDisk('linux')).toBe(true)
  })

  it('is a named pipe on Windows, one per data folder, however the folder is written', () => {
    const installed = askedEndpoint('C:\\Users\\anton\\AppData\\Roaming\\geckit', 'win32')
    expect(installed).toMatch(/^\\\\\.\\pipe\\geckit-geckit-[0-9a-f]{12}$/)
    expect(askedEndpoint('C:/Users/anton/AppData/Roaming/geckit/', 'win32')).toBe(installed)
    expect(askedEndpoint('c:\\users\\Anton\\AppData\\Roaming\\geckit', 'win32')).toBe(installed)
    expect(askedEndpoint('C:\\Users\\anton\\AppData\\Roaming\\geckit-local', 'win32')).toMatch(/^\\\\\.\\pipe\\geckit-geckit-local-[0-9a-f]{12}$/)
    expect(askedEndpoint('C:\\Users\\anton\\AppData\\Roaming\\geckit-local', 'win32')).not.toBe(installed)
    expect(endpointOnDisk('win32')).toBe(false)
  })

  it('tells two people apart whose names a pipe cannot carry', () => {
    const one = askedEndpoint('C:\\Users\\\u0410\u043d\u0442\u043e\u043d\\AppData\\Roaming\\geckit', 'win32')
    const other = askedEndpoint('C:\\Users\\\u0418\u0432\u0430\u043d\\AppData\\Roaming\\geckit', 'win32')
    expect(one).toMatch(/^\\\\\.\\pipe\\geckit-geckit-[0-9a-f]{12}$/)
    expect(one).not.toBe(other)
  })

  it('writes a path with forward slashes', () => {
    expect(forwardSlashes('C:\\Users\\anton\\.geckit')).toBe('C:/Users/anton/.geckit')
    expect(forwardSlashes('/Users/alex/.geckit')).toBe('/Users/alex/.geckit')
  })
})
