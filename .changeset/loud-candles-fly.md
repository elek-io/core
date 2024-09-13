---
'@elek-io/core': minor
---

Git messages are now stringified JSON containing more information about the operation like the object type and ID.
Git commits now contain the tag objects directly, instead of just the reference.
Projects now have a "production" and a "work" branch.
Returned Projects now contain remoteOriginUrl without the need of calling this method separately.
Projects now have a protection against deletion if there is no remote yet or the local Project has changes not present on the remote yet.
If Projets have to be deleted anyway, there now is a "force" option to do so.
Changed Project upgrade to work with an additional upgrade branch and then squash merge it back into work branch.
Removed old file based upgrade.
Added git merge and branch delete method.
Added support for most file types to be used as Assets.
Added more tests and converted clone related tests from using a remote Github repository to a local one.
Removed return for logging methods and added timestamp to CLI output.
