import { Buffer } from 'node:buffer'
import { setTimeout, clearTimeout } from 'node:timers'
import process from 'node:process'
import console from 'node:console'
import { createServer } from 'node:http'
import { PeerConnection, cleanup, getLibraryVersion } from 'node-datachannel'

const browserMode = process.argv.includes('--browser')
const peers = []
const config = { iceServers: [] }
const evidence = { node: process.version, platform: process.platform, arch: process.arch, library: getLibraryVersion() }

function peer(name) {
  const result = new PeerConnection(name, config)
  peers.push(result)
  return result
}

async function loopback() {
  const left = peer('probe-left')
  const right = peer('probe-right')
  left.onLocalDescription((sdp, type) => right.setRemoteDescription(sdp, type))
  right.onLocalDescription((sdp, type) => left.setRemoteDescription(sdp, type))
  left.onLocalCandidate((candidate, mid) => right.addRemoteCandidate(candidate, mid))
  right.onLocalCandidate((candidate, mid) => left.addRemoteCandidate(candidate, mid))
  const payload = 'geckit-real-webrtc-'.repeat(500)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebRTC loopback timed out')), 10000)
    right.onDataChannel(channel => channel.onMessage(message => channel.sendMessage(String(message))))
    const channel = left.createDataChannel('geckit')
    channel.onError(error => reject(new Error(error)))
    channel.onOpen(() => channel.sendMessage(payload))
    channel.onMessage(message => {
      if (message !== payload) return reject(new Error('Payload mismatch'))
      clearTimeout(timeout)
      resolve()
    })
  })
  console.log(JSON.stringify({ ...evidence, scenario: 'node-node', bytes: payload.length, selectedPair: left.getSelectedCandidatePair(), fingerprint: left.remoteFingerprint(), result: 'pass' }))
}

async function browser() {
  const html = `<!doctype html><meta charset="utf-8"><title>GeckIt real WebRTC transport probe</title><h1>Real browser → Node WebRTC</h1><pre id="result">Connecting…</pre><script type="module">
const output = document.querySelector('#result');
try {
const pc = new RTCPeerConnection({iceServers:[]});
const dc = pc.createDataChannel('geckit');
const payload = 'geckit-browser-'.repeat(500);
dc.onopen = () => dc.send(payload);
dc.onmessage = async event => { if(event.data !== payload) throw new Error('Payload mismatch'); output.textContent = JSON.stringify({result:'pass',bytes:payload.length,userAgent:navigator.userAgent,connectionState:pc.connectionState},null,2); await fetch('/result',{method:'POST',body:output.textContent}); pc.close(); };
await pc.setLocalDescription(await pc.createOffer());
await new Promise(resolve => {if(pc.iceGatheringState==='complete')resolve();else pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete')resolve()});});
const answer = await fetch('/offer',{method:'POST',body:JSON.stringify(pc.localDescription)}).then(response=>response.json());
await pc.setRemoteDescription(answer);
setTimeout(()=>{if(output.textContent==='Connecting…')output.textContent='Timed out'},10000);
} catch(error) {output.textContent=String(error)}
</script>`
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()
    if (request.url === '/offer') {
      const offer = JSON.parse(body)
      const pc = peer('probe-browser')
      pc.onDataChannel(channel => channel.onMessage(message => channel.sendMessage(String(message))))
      pc.onGatheringStateChange(state => {
        if (state !== 'complete') return
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(pc.localDescription()))
      })
      pc.setRemoteDescription(offer.sdp, offer.type)
    } else if (request.url === '/result') {
      console.log(JSON.stringify({ ...evidence, scenario: 'browser-node', browser: JSON.parse(body), selectedPair: peers.at(-1).getSelectedCandidatePair(), result: 'pass' }))
      response.end('ok')
    } else {
      response.setHeader('Content-Type', 'text/html')
      response.end(html)
    }
  })
  server.listen(47931, '127.0.0.1', () => console.log('Browser probe: http://127.0.0.1:47931'))
}

try { if (browserMode) await browser(); else await loopback() }
finally { if (!browserMode) { peers.forEach(connection => connection.close()); cleanup() } }
