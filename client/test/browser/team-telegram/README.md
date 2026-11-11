# Team Telegram renderer fixture
From client, run:
```sh
npm exec vite -- --config test/browser/team-telegram/vite.config.ts --port 5298
```
Open /test/browser/team-telegram/?theme=light or theme=dark. Use state=confirming for topic confirmation, state=members for admitted private chats, and state=members&long=1 for the maximum 1024 archived/admitted routes. This renders the real component against fake IPC, without bot tokens or provider calls.

Validate at 1280x900 and 390x900 in both themes. Topic setup covers approver IDs and exact candidate confirmation. Member setup covers enable/save projects, create invitation, optional own-task approval and narrower projects, admission, revocation, archive toggle and disable. Fake actions update the component state. Enter activates buttons; Escape within an invitation cancels it and restores focus to status. Check readable wrapping, no horizontal overflow, scrollable long lists and visible focus. This fixture does not validate backend authorization; native fake-API/provider tests do that.
