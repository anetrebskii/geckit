# Manager reminders for unanswered questions

- Request: Instruct Manager to remind the user when a question goes unanswered.
- Checkout: `/Users/alex/Projects/mine/geckit`, permanent `main` checkout.
- Started: 2026-11-19. Codex session `01a1f557-ea24-7821-b985-5840196b0ffe`.

## Acceptance conditions

- A later message continues the same task without answering its open blocking question. Manager checks that it is still open and includes one reminder with the action needed in that thread.
- An answered question, an unrelated conversation or a question already followed up on produces no further reminder.
- Assumption: Use a later reply about the same task as the trigger. Existing message delivery and approval handling supply the answer path.

## Progress

### 1. Prepare the UX document

- Evidence: `docs/ux/manager-threads.md` describes the reminder and its trigger.

### 2. Prepare the UI and test it

- Not applicable: The reminder uses the existing reply surface.

### 3. Write the feature code

- Replaced the blanket instruction to stay silent about unanswered questions in `client/src/prompts/manager/instructions.md`. The exception is scoped to a still-open question about the current task and asks for the original answer path.

### 4. Update the related distributed skills

- Not applicable: This applies to all Manager replies and belongs in the always-loaded instructions.

### 5. Update the feature list

- Not applicable: This corrects the reminder behavior inside the existing Manager threads workflow.

### 6. Write unit tests

- Manager and guide tests passed (231 across three files). Typecheck and desktop/service builds passed. Repository-wide lint reported 43 errors in five unrelated build scripts.

### 7. Test the feature through UI tools

- Confirmed the updated rule is bundled into the desktop and headless service. The Manager tests exercise prompt delivery with fixture providers. Live model adherence and channel delivery remain unverified.

### 8. Test the final UI

- Not applicable: Existing channel message rendering supplies the UI.

## Result

- Delivery: local source change in the permanent checkout.
