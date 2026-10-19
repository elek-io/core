---
'@elek-io/core': minor
---

**dugite `^3.2.3` is required.** The peer range rises from `^3.0.0`. dugite 3.2.3 is the first release whose embedded Linux git links `libcurl.so.4`. Earlier releases link `libcurl-gnutls.so.4`, which Fedora, RHEL, openSUSE and NixOS do not ship, so every fetch, push and clone against an HTTP(S) remote failed there. Update dugite alongside Core.

**A git that cannot load a shared library throws `PreconditionFailed`** naming the library, rather than `Internal` with the loader's message only in `error.cause`. This covers a missing library and a `libcurl.so.4` built for another TLS backend.
