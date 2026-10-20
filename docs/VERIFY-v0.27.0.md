# Quick verification after upgrading

No cloud-storage account or billing setup is needed for this update. Keep your current storage/upload settings.

1. Open the feed. Posts with no replies, likes or reposts should show icons without 0 labels. Like and unlike a post; confirm the icon state and count change and zero disappears again.
2. Open another account in a separate browser/private window. Like/reply/repost while the first account can see the post. Its count should refresh on focus or within about 12 seconds while visible. This version uses batched polling rather than instant socket delivery. Existing notification delivery remains separate.
3. Open a post. Check the timestamp/member-view line, positive engagement counts and bookmark count. Bookmark it from another account and check that the count changes; its saved-post list and identity are not revealed.
4. Open Share. Copy link should copy the correct post/article address. Share post via… should open your device's share sheet if supported; otherwise it copies the link with a notice. Dismissing the share sheet should not produce an error. Chat sharing should appear only when messages are enabled, prefill a draft and require a recipient/send action.
5. Trigger a success toast on desktop. It should sit inside the central content column. Check a narrow mobile viewport and dark appearance too.
6. Scroll Home, then click the active For you tab or platform logo. The feed should refresh and scroll to the top without reloading the browser document. Opening a post and using Back should retain the existing reading-position behavior.
7. Signed out, start Create your account from the landing page: it should open /register, with no popup. Check all four stages. Try an unavailable username, then an available one. Optional profile details and interests can be skipped. Occupation has preset and custom choices; skills accept up to eight comma-separated entries.
8. A new account should get an optional topics/people card in Home. Skip all follows and confirm the feed still works. Refresh and confirm completed onboarding stays dismissed. Where email verification is required, follow/post/like restrictions still apply until verified.
9. In Settings, edit gender, occupation and skills. Gender, birth date and phone should be private; occupation and skills should appear on the public profile. Existing accounts should not be forced through onboarding.
10. Visit a public profile/post while signed out and sign in from an action: that contextual dialog should keep the original page. Registration there can also finish without forcing navigation to Home.

Native OS sharing, browser select styling, actual Windows upgrade execution and live multi-user hosting should also be checked on your machine. Local automated browser tests use Chromium; native sharing was checked with a browser mock, not a real OS picker.
