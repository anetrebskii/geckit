import { join } from 'node:path'

import { HostDisk } from '../main/hosts/disk'
import { Hosts } from '../main/hosts/hosts'
import type { HostsDeps } from '../main/hosts/hosts'
import { Forwards } from '../main/hosts/forward'
import { runsAt } from '../main/hosts/runs'
import type { Routes } from '../main/hosts/route'

export function createCoreHosts(deps: HostsDeps): Routes {
  const held: { disk?: HostDisk; forwards?: Forwards } = {}
  const hosts = new Hosts({
    ...deps,
    forwardsChanged: (id) => { held.forwards?.closeHost(id); deps.forwardsChanged?.(id) },
    diskForget: (id) => { void held.disk?.forget(id); deps.diskForget?.(id) },
  })
  const disk = held.disk = new HostDisk(hosts, deps.folder)
  const forwards = held.forwards = new Forwards(hosts)
  return { hosts, disk, forwards, runs: runsAt(join(deps.folder, 'runs.json')) }
}
