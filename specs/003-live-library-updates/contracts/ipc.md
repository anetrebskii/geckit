# IPC Contract

`chat:applyProviderUpdate(id: string): Promise<LlmProviderInfo>` applies one staged library. It rejects if Chat is unavailable, the ID is invalid or not installed, there is no ready candidate, identity validation fails, or runtime activation fails. On success the main process broadcasts the updated settings and returns the active provider metadata.
