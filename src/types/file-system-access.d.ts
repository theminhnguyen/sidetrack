// TypeScript's bundled DOM lib does not include the File System Access API —
// it's Chromium-only and never reached full cross-browser standardization, so
// lib.dom.d.ts omits it. This declares just the handful of members this app
// actually calls, rather than pulling in a full @types package for it.
export {}

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  type FileSystemWriteChunkType = BufferSource | Blob | string

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: FileSystemWriteChunkType): Promise<void>
    close(): Promise<void>
  }

  interface FileSystemHandle {
    readonly kind: 'file' | 'directory'
    readonly name: string
    isSameEntry(other: FileSystemHandle): Promise<boolean>
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: 'file'
    getFile(): Promise<File>
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface OpenFilePickerOptions {
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    multiple?: boolean
  }

  interface SaveFilePickerOptions {
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    suggestedName?: string
  }

  interface Window {
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
  }
}
