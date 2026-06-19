# Asset Management

Assets are the files in a Project - images, documents, archives, anything. They are managed through `core.assets` and stored as two files each: the binary and a JSON metadata sidecar.

For how Assets are referenced from Entries, see [`fields.md`](./fields.md#relational-value-type-reference). For where the files sit on disk, see [`storage-layout.md`](./storage-layout.md).

## The two-file model

Every Asset is stored as:

- the **binary** at `lfs/{assetId}.{extension}` (tracked with Git LFS, see [`git-and-sync.md`](./git-and-sync.md#git-lfs)), and
- a **metadata file** at `assets/{assetId}.json`.

The metadata file (`AssetFile`) carries:

```typescript
{
  objectType: 'asset',
  id: string,            // UUID
  name: string,          // plain string, slugified on write
  description: string,   // plain string
  extension: string,     // derived from the file, readonly
  mimeType: string,      // derived from the file, readonly
  size: number,          // bytes, readonly
  coreVersion, created, updated,
}
```

`name` and `description` are **plain strings, not translatable** (unlike Entry values). Note that `name` is run through Core's slugifier on write, so `"My Logo"` is stored as `"my-logo"`.

When you read an Asset, Core returns the metadata plus an `absolutePath` pointing at the binary on disk - so an `Asset` is an `AssetFile` plus `absolutePath`.

**There are no image dimensions and no image processing.** Core records `extension`, `mimeType` and `size` only. It does not compute width/height, generate thumbnails, or resize - that is left to the rendering layer.

## Creating an Asset

```typescript
const asset = await core.assets.create({
  projectId: project.id,
  filePath: Path.resolve('./logo.png'),
  name: 'Logo',
  description: 'The company logo',
});
```

Core derives the `mimeType` and `extension` from the file using the `mime` package, reads the `size` from the filesystem, copies the binary into `lfs/`, writes the metadata JSON, and commits both. If `mime` cannot determine a type or extension for the file, `create()` throws `BadRequest`. There is no MIME allowlist at creation - any type the `mime` package recognizes is accepted.

## Reading and extracting

- `read({ projectId, id })` returns the `Asset` with its `absolutePath`. Pass a `commitHash` to read the Asset as it existed at that commit - the historical binary is written to a temp file and `absolutePath` points there. See [`usage.md`](./usage.md#reading-from-history).
- `history({ projectId, id })` returns the Asset's commit history.
- `save({ projectId, id, filePath })` copies the Asset's binary out to a path you choose (optionally `commitHash` for a historical version). This is how you export a file back to disk.
- `list({ projectId, limit, offset })` and `count({ projectId })` page through a Project's Assets. Both are driven by the JSON metadata sidecars in `assets/`, not the binaries in `lfs/`, so the metadata is the source of truth for which Assets exist. An Asset whose binary is missing or not yet fetched still appears in the list (its `absolutePath` then points at a file that is not on disk, surfacing only when you actually read the bytes via `save` or export).

## Updating

`update({ projectId, id, name, description, newFilePath? })` changes the metadata and, if `newFilePath` is given, replaces the binary. Replacing the binary re-derives `extension`, `mimeType` and `size` and copies in the new file. The previous binary is removed only when the new file's extension differs, since a same-extension replacement reuses the same path and removing it would delete the file just written.

## Deleting

`delete({ projectId, id, extension })` removes both the binary and the metadata file and commits the deletion. Two things to know:

- You must pass the `extension` (Core needs it to locate the binary under `lfs/`).
- **Delete is blocked while the Asset is still referenced.** Deleting an Asset that an Entry still points at fails with a `Conflict` that lists the referring Entries, so you remove or repoint those references first. See [`references.md`](./references.md) for the full model.

## Restricting Asset types on a field

`asset` reference fields and `markdown` fields both accept an `ofAssetMimeTypes` allowlist. At Entry write time, Core reads the referenced Asset's `mimeType` and rejects the reference if it is not in the allowlist (an empty allowlist means "any type"). This is enforced in the Entry validation layer, so a field restricted to `['image/jpeg', 'image/png']` cannot reference a PDF.

## See Also

- [`fields.md`](./fields.md) - `asset` reference fields and `ofAssetMimeTypes`
- [`storage-layout.md`](./storage-layout.md) - where Asset files live on disk
- [`markdown-content.md`](./markdown-content.md) - `assetReference` nodes in rich text
- [`usage.md`](./usage.md) - creating Assets in context
