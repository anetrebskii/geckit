# Data model

PluginContext has one scoped log. PluginLogger has path and write(level,event,fields). Records have at ISO timestamp, level (debug/info/warn/error), plugin normalized identity, event stable name and optional fields of scalar values. Host adds load/request IDs; plugins add check IDs and counts/status/timing. Identity and event are not supplied as arbitrary payload overrides. Per-path queue orders records across loaded versions and owns rotation. Tmux messages/check generations remain runtime state; log events do not drive checks.
