---
'@elek-io/core': minor
---

Give every User an account id, empty for one who has not signed in.

`localUserSchema` now carries `id: null` where `cloudUserSchema` carries the account id, so both kinds of User have the key and reading `user.id` no longer means checking which kind you are holding first. Which kind and which account stay in step: a local User with an account id and a Cloud User without one are both shapes nothing can hold, because each kind narrows the id the same way it already narrows `userType`.

**This invalidates an existing `user.json`.** A file written before this has no `id`, and `core.user.get()` answers `null` for a User it cannot read, so it will report that no User is set. Setting the User again writes a file that reads. Anything calling `core.user.set()` passes `id: null` for a local User now.

The split between who somebody is and how their machine is set up moved with it. `userSettingsSchema` holds `localApi`, and the file on disk is a User plus their settings, so a User on its own is identity and says nothing about the machine it was set up on. That is what makes one safe to put in a bug report.
