# Data model
Server: random ID and signing key. Device: public key, random private rendezvous secret, project scope, role observe, revoked timestamp. Invitation: random 128+bit secret, expiration, single consumption, in memory. Pending: unique request, proof key, phrase. Client: nonextractable private signing key + saved server pin and sealed trust. Snapshot: serverID, epoch, sequence, scoped projects/sessions and safe Manager summary. History: scoped session key + revision + page. IDs are opaque host-scoped refs; display paths never reach local filesystem APIs.


Revision: full?: true on invitation/device/signed trust is explicit whole-server authority. Omission preserves old scope. Full snapshots derive current projects per request. Core call is a method/arguments union derived from CoreMethods; results use its return types; CoreEvent is reused. No provider credential is part of enrollment. Pending RPC exists only for one live connection and is rejected on loss.
