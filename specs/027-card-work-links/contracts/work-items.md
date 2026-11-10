# Work links contract

ChatSession.workItems optionally supplies at most two canonical destinations; work retains the first for older clients. Updated clients fall back to work when workItems is absent. Existing IPC/phone session broadcasts carry the optional field.

Only sent user/assistant text is indexed. GitLab !N means merge request, #N means issue; tooltip includes server/project. Fragments/queries collapse; Linear retains existing slug handling. Existing notes persist bounded metadata.
