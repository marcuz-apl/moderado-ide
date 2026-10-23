# IDE config coordination design

## Goal

Make concurrent Moderado IDE writes to `~/.moderado/config.json` merge safely, avoid conflicts on unrelated connection entries, and fail closed when lock ownership cannot be proven stale.

## Design

All IDE config mutations continue to use `updateConfigCoordinated`: acquire the IDE lock, reread and validate the current JSON object while locked, compare only fields the caller owns, merge the patch into the current object, and atomically replace the file. Connection edits compare only their connection ID and any top-level active/default model fields they actually change. A distinct IDE process test will prove separate connection writes survive.

Lock records contain the process ID and a unique owner token. Age alone never permits lock deletion. An expired lock may be removed only when its recorded process is demonstrably gone and a separate exclusive reaper marker has been acquired; the reaper rechecks the same lock token before removal. Unknown, malformed, or uninspectable ownership fails closed with recovery guidance.

This protocol coordinates IDE writers that use it. External writers must adopt the same lock protocol for cross-application write safety; no CLI repository changes are in scope. Existing unknown config fields remain preserved. Corrupt config remains untouched.

## Verification

Use isolated temporary profile fixtures. Add regression coverage for unrelated nested connection edits, separate process writers, active-but-old lock preservation, safely reaped dead-owner locks, and conflict on the same connection. Run focused profile/host tests, extension test suite, typecheck, compile, and `git diff --check`. Real packaged editor restart verification will be performed by the owner through GitHub Actions after release and is not claimed here.
