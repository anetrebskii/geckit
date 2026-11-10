# Data model

WorkItem retains label/url/says. ChatSession, SessionNote and provider/disk rows gain optional readonly workItems. Legacy work is the first item. Undefined means not read; an empty list can clear known metadata.

ConversationItems extends the transcript map and indexes canonical links in sent mine/theirs messages. workItems is a stable cached array: first subject and latest distinct link. Only parsed link changes invalidate it. Full read replaces the index; clear empties it.

An incomplete live transcript is seeded with listed/saved metadata, so a temporary read failure cannot erase known tags on the next message. A successful complete read replaces that seed, including an explicitly empty history. Linkless messages retain their index position so links added by later streaming updates follow transcript order.
