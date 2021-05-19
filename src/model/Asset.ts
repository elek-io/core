import AssetFile from './AssetFile';

/**
 * The Asset class extending AssetFile class represents an external file like image, PDF or ZIP.
 * In addition to the AssetFile's saved file content, the Asset contains meta information about that file,
 * like EXIF, dimensions and the absolute path to it.
 */
export default class Asset extends AssetFile {
  public readonly created: number;
  public readonly modified: number;

  /**
   * Absolute path on this filesystem
   */
  public readonly absolutePath: string;

  /**
   * Total size in bytes
   */
  public readonly size: number;

  constructor(assetFile: AssetFile, created: number, modified: number, absolutePath: string, size: number) {
    super(assetFile.id, assetFile.language, assetFile.name, assetFile.description, assetFile.extension, assetFile.mimeType);
    
    this.created = created;
    this.modified = modified;
    this.absolutePath = absolutePath;
    this.size = size;
  }
}