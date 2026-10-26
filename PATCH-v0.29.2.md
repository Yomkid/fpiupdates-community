# FpiUpdates v0.29.2 — verified identities

This patch is built for v0.29.1. It uses the existing PostgreSQL FeatureSwitch, identity-request, account-notice and audit tables. No schema migration is added. The backend and frontend source both change; rebuild both before running or deploying.

## Release controls

Staff tools → Feature releases now has two independent switches, both **off by default**:

1. **Category badge colours:** green for verified individuals, creators and media; gold for verified businesses and institutions; grey for verified government accounts. With the switch off, every verified account uses green.
2. **Organisation profile shapes:** rounded-square pictures for verified businesses and institutions; circular pictures for individuals, creators, media and government accounts. With the switch off, pictures remain circular.

Only accounts with identityStatus VERIFIED receive badges or verified organisation shapes. Choosing a category in a request does not give either. Existing verified accounts use their already-reviewed categories when a switch is enabled. Pausing a switch changes presentation, not identity status, account data, permissions or subscriptions. Feature settings require features.manage and changes are recorded in the audit log. Availability refreshes on page focus or within 30 seconds while visible.

Unknown or missing category values fall back to a green badge and round avatar. If the features endpoint cannot be reached, the frontend starts with the existing green/round appearance until it can load the configured switches. If you have customised Help Centre articles, review and update their wording before releasing the colours; your edited content is not overwritten.

## How organisations use it

A business, institution or government organisation first creates a normal FpiUpdates account with its public name and confirms its email. It then opens Settings → Verification, submits an identity-verification request and selects the appropriate category. The form asks the representative to provide public evidence such as an independently discoverable official website, a public reference to the FpiUpdates account where available, and an explanation of their authority to represent the organisation.

An authorised staff member opens Staff tools → Verification & claims, independently checks the organisation and the representative's authority using suitable official channels, and approves, requests more information or rejects with a reason. The platform does **not** automatically verify a company registry, validate a government domain, or prove a requester is an authorised officer. Email or Google sign-in alone is not proof of organisational authority. The form is not designed for ID scans, passwords, payment data or one-time codes. Reviewers should follow the operator's privacy and verification policy.

An organisation may request a protected username through the existing claim process. A reviewed claim is not an automatic handle transfer; a separate authorised assignment and conflict review are required. The current model is one ordinary account representing an organisation; it does not yet provide organisation-owned workspaces, multiple delegated account managers or automated affiliation badges. Do not share account passwords to simulate delegation.

## Protecting an approved identity

For a VERIFIED account, changing the display name, username or profile picture moves its identity status to REVIEW, hiding the badge and verified organisation shape until authorised staff review it again. The account receives an in-app notice and the change is recorded in the audit log. Unchanged profile details do not trigger review. Cover-image edits alone do not trigger this rule. In-app account notices continue to use the existing polling system; they are not a newly added background push notification.

## Install locally

Stop the running local application. Extract the ZIP to a new directory, then run the included install-patch.ps1 with -Project pointing to your already-patched v0.29.1 project folder. It validates the version, copies only the files in the patch manifest, saves replaced files under backups/ui-v0292-..., and builds backend and frontend. It does not overwrite .env, upload directories, database contents or Git history. The script uses npm ci only when a component's dependencies are missing. It does not run migrations or deploy to GitHub, Render or Vercel.

## Deploy after local checks

Your local folder is still named FpiUpdates-v0.29.0/fpiupdates even though its package version becomes v0.29.2. After reviewing and testing, use the updated apply-to-repo.ps1 in that local project to copy the full source into your clean existing Git checkout on a new upgrade branch. Review git diff and test. Back up the hosted database and deploy the backend before the frontend when ready; this patch has no migration, but if the hosted installation is still v0.28.0 it first needs the v0.29.0 identity migration described in UPGRADE-v0.29.0.md.

## Rollback

Revert code to a reviewed prior commit and rebuild or redeploy both components. Unknown flag rows remain harmless when the earlier code is restored. Disabling the two switches also restores green badges and round avatars without changing verification status. Profile edits that moved a verified account to REVIEW remain recorded; a reviewer must approve it again if appropriate.

## Validation limits

Build, feature/permission, identity-request and appearance tests are reported in VALIDATION-v0.29.2.md. Live provider checks, real email delivery, hosted deployment and Windows execution of the PowerShell helper must be verified in your own staging environment.
