# Acceptance walkthrough

Open Settings > Web Browser > Browser profiles. Create `github-work` with an account note, verify the new closed row and focused Open browser action, open it, then sign in manually. Verify cancellation, invalid/duplicate names, preserved failed input, repeat-click protection, row failures, live sign-in and deletion confirmation/cancellation.

Close the browser before exporting:

```sh
geckit browser profiles export github-work --output ./github-work.geckit-profile.gz
geckit browser profiles import ./github-work.geckit-profile.gz --name github-restored
```

Transfer the archive manually for another computer. Opening the imported profile may require sign-in. Treat the archive as private browser data.

Automated checks use synthetic files and injected native failures. Review the real Settings renderer at desktop/narrow sizes in both themes, keyboard focus and long-list scrolling. Do not use real account secrets to verify archive behavior. Record actual verification separately from untested cross-machine authentication.
