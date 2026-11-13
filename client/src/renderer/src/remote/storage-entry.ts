import type { ConnectionStorage } from '../../../shared/remote/storage'
import { devicePublicKey, signDevice, savedServers, rememberServer, forgetServer, nameServer } from './storage'

Object.defineProperty(window, 'geckitConnectionStorage', { value: { publicKey: devicePublicKey, sign: signDevice, list: savedServers, remember: rememberServer, forget: forgetServer, name: nameServer } satisfies ConnectionStorage })
