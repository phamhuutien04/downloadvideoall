const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('clipVault', {
  defaultFolder: () => ipcRenderer.invoke('folder:default'),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  openFolder: (folder) => ipcRenderer.invoke('folder:open', folder),
  downloaderStatus: () => ipcRenderer.invoke('downloader:status'),
  installDownloader: () => ipcRenderer.invoke('downloader:install'),
  ffmpegStatus: () => ipcRenderer.invoke('ffmpeg:status'),
  installFfmpeg: () => ipcRenderer.invoke('ffmpeg:install'),
  loadPreview: (request) => ipcRenderer.invoke('preview:load', request),
  openYoutubePreview: (url) => ipcRenderer.invoke('preview:open-youtube', url),
  startDownload: (request) => ipcRenderer.invoke('downloads:start', request),
  cancelDownload: () => ipcRenderer.invoke('downloads:cancel'),
  onProgress: (callback) => subscribe('downloads:progress', callback),
  onStatus: (callback) => subscribe('downloads:status', callback),
  onLog: (callback) => subscribe('downloads:log', callback),
  onCompleted: (callback) => subscribe('downloads:completed', callback),
  onCancelled: (callback) => subscribe('downloads:cancelled', callback),
  onFailed: (callback) => subscribe('downloads:failed', callback),
})
