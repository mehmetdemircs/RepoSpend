export interface FileSystemLike {
  existsSync(path: string): boolean;
  statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
  readFileSync(path: string, encoding: BufferEncoding): string;
}
