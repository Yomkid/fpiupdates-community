# FpiUpdates v0.17.0

## Included

- Google sign-in and guided first-time onboarding, with password-confirmed connection/disconnection for existing accounts. Google remains hidden until configured. See GOOGLE-SIGN-IN.md.
- Private **one-to-one text messages**, up to 2,000 code points per message. Start from a profile envelope or Messages → New message. Requests, acceptance/decline, unread conversation/request badges, message history pagination, duplicate-send protection, privacy settings, bilateral blocking and private message reports are included.
- Default privacy allows one initial message request. If the recipient already follows the sender, the conversation is accepted immediately. Request senders must wait for acceptance. Members can allow only people they follow or disable new conversations in Settings. Existing accepted conversations remain until blocked. Declined requests cannot be restarted by sending again.
- A profile bell appears after following an account. Enable it to receive that account's subsequent top-level posts, reposts and quotes; replies are excluded. The default is off, including existing follows. Unfollowing removes the subscription.
- Likes/reposts are grouped per destination post and Nigeria calendar day; follows are grouped by day. Profile-bell activity groups per followed account/day and opens its own chronological activity feed. Individual replies, mentions and quotes retain their conversation targets. Badges count unread groups, and opening a group marks only the observed events read, leaving newer arrivals unread.
- Opened-post composer appears immediately below the **selected** post and replies to that ID. Real parent ancestry appears above it; reader replies and author answers remain inside their correct branches. No unrelated self-reply is relocated into another reply's ancestry. Author continuations remain visible without rewriting parents.
- A quote of a quoted post preserves the nested original preview. Preview depth is bounded; deeper context can be opened explicitly. Unavailable or hidden originals are not exposed.
- Styled registration/sign-in inputs, account panels, contextual dialogs and Google enrollment controls, using the existing green/black branding and responsive appearance.

## Moderation and privacy

Only conversation participants can read private message history; administrators do not get a general read-all-chat endpoint. A participant can report an incoming message, including after blocking. The reported message snapshot and explanation become accessible to staff with **moderation.manage**, via Messages → Reported messages (`/admin/message-reports`). Resolving a report records the reviewer, note and audit entry. It does not automatically suspend accounts; existing moderation tools handle that decision.

Messages are **not end-to-end encrypted**. They live in PostgreSQL and database backups; operators with database access can technically read them. Retention/deletion and a production privacy policy need an explicit operational policy before public rollout. This release does not add group chat, attachments, voice/video, typing indicators, delivery receipts, edit/delete or an encryption claim.

Counts refresh while the app is open (15 seconds); open conversations poll every 5 seconds. This uses the existing API process and PostgreSQL without Redis or a separate WebSocket worker. It still needs a hosting plan that reliably runs the NestJS app. Normal notification desktop alerts retain browser-permission/open-tab requirements. Messages have in-app counts/toasts and tab totals, not closed-browser push delivery. No performance or concurrent-campus-load guarantee is implied.

## Upgrade

Stop the previous apps using Ctrl+C. Extract this ZIP into a new version folder, then run `upgrade-from-v016.ps1 -OldProject <previous-project-folder>`. It saves a SQL backup, copies the existing environment and Docker configuration, preserves default local uploads and runs setup. Existing absolute media paths remain valid through the copied environment. Keep the old folder and backup until testing succeeds. Node >=22.12 is required.

Two additive SQL migrations follow the unchanged seventeen existing migrations. Existing password accounts remain password-enabled; existing follows have alerts off; existing notifications retain read state and receive group keys. No production sample users, messages or engagements are seeded. Do not delete the database volume. Add the three Google variables separately when ready.

## Local acceptance checks

1. Sign in with two accounts. From a profile, send one request; accept it in the other account's Requests tab; exchange text; reload to confirm history. Decline/block unwanted contacts; verify privacy settings.
2. Report an incoming message, then review/resolve it using a moderation account. A regular account must not access another conversation or moderation evidence.
3. Follow an account, enable its bell and publish two posts/repost/quote from that account. Confirm grouped activity opens the correct timeline. Like a post from two other accounts and confirm one grouped row.
4. Open a root post with self-replies and reader replies. Reply from the box directly below the selected post; open a nested answer and check its actual parent/context. Quote a quoted post and check the original preview.
5. Configure Google, test new registration, existing-account linking and sign-in, contextual return destination and password recovery with real email. An actual Google round trip and Windows/Docker/Truehost deployment remain environment-specific checks.
