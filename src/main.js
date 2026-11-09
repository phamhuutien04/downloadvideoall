const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { promisify } = require('node:util')
const yauzl = require('yauzl')
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')

// ClipVault only accepts URLs, so Chromium's spelling service is unnecessary.
// Disabling it also prevents malformed Windows language identifiers from
// creating empty `Microsoft\\Spelling\\neutral` folders beside the project.
app.commandLine.appendSwitch('disable-features', 'Spellcheck')

// ClipVault does not use WebGL. This avoids a Windows GPU-process startup
// failure seen on machines with incomplete graphics runtime components.
if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
  // Avoid Electron's default roaming-profile lookup on affected Windows setups.
  // A caller-provided profile directory always takes precedence for testing/support.
  if (!app.commandLine.hasSwitch('user-data-dir')) {
    app.setPath('userData', path.join(process.env.LOCALAPPDATA, 'ClipVault'))
  }
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

const youtubedl = require('youtube-dl-exec')
const execFileAsync = promisify(execFile)

const PLATFORM_RULES = {
  facebook: { label: 'Facebook', domains: ['facebook.com', 'fb.watch'] },
  youtube: { label: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
  tiktok: { label: 'TikTok', domains: ['tiktok.com'] },
  rednote: { label: 'RedNote', domains: ['rednote.com', 'xiaohongshu.com', 'xhslink.com'] },
  x: { label: 'X', domains: ['x.com', 'twitter.com'] },
}

const YT_DLP_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
const FFMPEG_RELEASE_API = 'https://api.github.com/repos/yt-dlp/FFmpeg-Builds/releases/latest'
const FFMPEG_ARCHIVE_NAME = 'ffmpeg-master-latest-win64-gpl.zip'
const FFMPEG_CHECKSUMS_NAME = 'checksums.sha256'
const MAX_YT_DLP_DOWNLOAD_BYTES = 100 * 1024 * 1024
const MAX_FFMPEG_ARCHIVE_BYTES = 250 * 1024 * 1024
const MAX_FFMPEG_BINARY_BYTES = 200 * 1024 * 1024
const RELEASE_METADATA_FETCH_TIMEOUT_MS = 120 * 1000
const RELEASE_ASSET_FETCH_TIMEOUT_MS = 20 * 60 * 1000
const TOOL_COMMAND_TIMEOUT_MS = 15 * 1000

let mainWindow
let activeJob = null
let startupErrorShown = false
let downloaderInstallation = null
let ffmpegInstallation = null

function reportStartupError(error) {
  const detail = error?.message || String(error || 'Lỗi không xác định.')
  console.error('[ClipVault]', error?.stack || detail)

  if (app.isReady() && !startupErrorShown) {
    startupErrorShown = true
    dialog.showErrorBox(
      'ClipVault không thể khởi động',
      `${detail}\n\nHãy đóng ứng dụng, mở lại và thử lần nữa.`,
    )
  }
}

process.on('uncaughtException', reportStartupError)
process.on('unhandledRejection', reportStartupError)

function send(sender, channel, payload) {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

function isAllowedUrl(value, platform) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return ['https:', 'http:'].includes(url.protocol) && PLATFORM_RULES[platform].domains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  } catch {
    return false
  }
}

function validateRequest(payload) {
  if (!PLATFORM_RULES[payload.platform]) throw new Error('Nền tảng không được hỗ trợ.')
  if (!['single', 'multiple', 'collection'].includes(payload.mode)) throw new Error('Chế độ tải không hợp lệ.')
  if (!Array.isArray(payload.urls) || payload.urls.length === 0) throw new Error('Hãy nhập ít nhất một URL.')

  const urls = [...new Set(payload.urls.map((value) => String(value).trim()).filter(Boolean))]
  if (urls.some((url) => !isAllowedUrl(url, payload.platform))) {
    throw new Error(`Mỗi URL phải là liên kết công khai của ${PLATFORM_RULES[payload.platform].label}.`)
  }
  if (payload.mode === 'collection' && urls.length !== 1) {
    throw new Error('Chế độ trang/kênh chỉ nhận một URL công khai mỗi lần.')
  }

  const rawOutputDir = String(payload.outputDir || '').trim()
  if (!rawOutputDir) throw new Error('Hãy chọn thư mục lưu cụ thể.')
  const outputDir = path.resolve(rawOutputDir)
  if (!outputDir || outputDir === path.parse(outputDir).root) throw new Error('Hãy chọn thư mục lưu cụ thể.')
  const maxItems = Number.parseInt(payload.maxItems, 10) || 0
  if (maxItems < 0 || maxItems > 10000) throw new Error('Giới hạn số video phải từ 0 đến 10.000.')

  return {
    platform: payload.platform,
    mode: payload.mode,
    urls,
    outputDir,
    maxItems,
    quality: ['best', 'standard', 'compact'].includes(payload.quality) ? payload.quality : 'best',
    skipExisting: payload.skipExisting !== false,
  }
}

function outputTemplate(request) {
  return path.join(
    request.outputDir,
    request.platform,
    '%(uploader|unknown)s',
    '%(title).160B [%(id)s].%(ext)s',
  )
}

function downloadFlags(request, ffmpegDirectory = null) {
  const formats = {
    withFfmpeg: {
      standard: 'bv*[height<=720]+ba/b[height<=720]/b',
      compact: 'bv*[height<=480]+ba/b[height<=480]/b',
    },
    withoutFfmpeg: {
      standard: 'b[height<=720]/b',
      compact: 'b[height<=480]/b',
    },
  }
  const archivePath = path.join(request.outputDir, '.clipvault-archive', `${request.platform}.txt`)
  const flags = {
    output: outputTemplate(request),
    newline: true,
    noPlaylist: request.mode !== 'collection',
    windowsFilenames: true,
    restrictFilenames: true,
    continue: true,
  }
  // Always require an audio-capable format. With FFmpeg, yt-dlp may download
  // separate video/audio streams and merge them; without it, only accept a
  // pre-muxed video+audio stream so the app never knowingly saves video-only.
  if (ffmpegDirectory) {
    flags.format = request.quality === 'best' ? 'bv*+ba/b' : formats.withFfmpeg[request.quality]
    flags.mergeOutputFormat = 'mp4/mkv'
    flags.ffmpegLocation = ffmpegDirectory
  } else {
    flags.format = request.quality === 'best' ? 'b' : formats.withoutFfmpeg[request.quality]
  }
  if (request.maxItems) flags.playlistEnd = request.maxItems
  if (request.skipExisting) {
    flags.noOverwrites = true
    flags.downloadArchive = archivePath
  }
  return flags
}

function cleanOutput(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim()
}

function normalizedDownloadUrl(platform, sourceUrl) {
  if (platform !== 'rednote') return sourceUrl
  try {
    const url = new URL(sourceUrl)
    const host = url.hostname.toLowerCase()
    // The bundled yt-dlp extractor currently recognizes the legacy
    // Xiaohongshu hostname. Preserve the public path and signed query string.
    if (host === 'rednote.com' || host.endsWith('.rednote.com')) {
      url.protocol = 'https:'
      url.hostname = 'www.xiaohongshu.com'
      return url.toString()
    }
  } catch {}
  return sourceUrl
}

function accessRequirementMessage(platform, value) {
  const detail = String(value || '').toLowerCase()
  const needsSession = detail.includes('log in for access')
    || detail.includes('login for access')
    || detail.includes('fresh cookies')
    || detail.includes('authentication is required')
    || detail.includes('sign in to continue')

  if (!needsSession) return null
  if (platform === 'tiktok' && detail.includes('comfortable for some audiences')) {
    return 'TikTok yêu cầu đăng nhập để xem video này vì nội dung bị giới hạn đối tượng. ClipVault chỉ tải URL công khai không cần đăng nhập.'
  }
  if (platform === 'tiktok') {
    return 'TikTok yêu cầu đăng nhập để truy cập video này. ClipVault chỉ tải URL công khai không cần đăng nhập.'
  }
  if (platform === 'rednote') {
    return 'RedNote yêu cầu phiên truy cập để tải nội dung này. ClipVault chỉ tải URL công khai không cần đăng nhập.'
  }
  return 'Nguồn này yêu cầu đăng nhập để truy cập video. ClipVault chỉ tải URL công khai không cần đăng nhập.'
}

function conciseDownloadError(error, platform, capturedMessage = null) {
  if (capturedMessage) return capturedMessage

  const raw = [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .map((value) => String(value))
    .join('\n')
  const accessMessage = accessRequirementMessage(platform, raw)
  if (accessMessage) return accessMessage

  if (/failed to resolve|name or service not known|getaddrinfo failed/i.test(raw)) {
    return 'Không thể kết nối đến máy chủ của nền tảng. Hãy kiểm tra mạng hoặc DNS rồi thử lại.'
  }

  const errorLine = raw
    .split(/\r?\n/)
    .map(cleanOutput)
    .find((line) => /\bERROR:\s*/i.test(line))
  if (errorLine) {
    const message = errorLine.replace(/^.*?\bERROR:\s*/i, '').trim()
    if (message && !/the command spawned as:|with the following trace:|exited with:/i.test(message)) {
      return `Không thể tải video: ${message.slice(0, 420)}`
    }
  }

  return 'Không thể tải URL này. Hãy kiểm tra liên kết có công khai và thử cập nhật yt-dlp trong Cài đặt.'
}

function ytDlpFileName() {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
}

function managedYtDlpPath() {
  return path.join(app.getPath('userData'), 'tools', ytDlpFileName())
}

function bundledYtDlpPath() {
  const binaryDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'youtube-dl-exec', 'bin')
    : path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin')
  return path.join(binaryDirectory, ytDlpFileName())
}

function ytDlpCandidates() {
  return [
    { path: managedYtDlpPath(), source: 'installed' },
    { path: bundledYtDlpPath(), source: 'bundled' },
  ].filter((candidate) => fs.existsSync(candidate.path))
}

async function ytDlpVersion(executablePath) {
  const { stdout } = await execFileAsync(executablePath, ['--version'], {
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  })
  const version = String(stdout || '').trim()
  if (!version) throw new Error('yt-dlp không trả về phiên bản.')
  return version
}

async function workingYtDlp() {
  let lastError = null
  for (const candidate of ytDlpCandidates()) {
    try {
      return { ...candidate, version: await ytDlpVersion(candidate.path) }
    } catch (error) {
      lastError = error
    }
  }
  return { path: null, source: null, version: null, error: lastError }
}

async function ytDlpStatus() {
  const candidate = await workingYtDlp()
  if (!candidate.path) {
    const detail = candidate.error
      ? `Không thể chạy yt-dlp: ${candidate.error.message || 'lỗi không xác định.'}`
      : 'Chưa có yt-dlp. Hãy cài từ mục Cài đặt.'
    return { ready: false, source: null, version: null, detail }
  }
  return {
    ready: true,
    source: candidate.source,
    version: candidate.version,
    detail: `yt-dlp ${candidate.version}`,
  }
}

function isTrustedGithubReleaseUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      host === 'github.com'
      || host === 'api.github.com'
      || host === 'objects.githubusercontent.com'
      || host === 'release-assets.githubusercontent.com'
    )
  } catch {
    return false
  }
}

function fetchTrustedGithubRelease(url, { timeoutMs = RELEASE_METADATA_FETCH_TIMEOUT_MS, ...options } = {}) {
  if (!isTrustedGithubReleaseUrl(url)) {
    throw new Error('Nguồn tải công cụ không được xác minh.')
  }
  return fetch(url, {
    redirect: 'follow',
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  })
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function releaseAssetDigest(asset) {
  const digest = String(asset?.digest || '').match(/^sha256:([a-fA-F0-9]{64})$/i)
  return digest ? digest[1].toLowerCase() : null
}

function hasWindowsExecutableHeader(filePath) {
  const file = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(2)
    return fs.readSync(file, header, 0, header.length, 0) === header.length && header.toString('ascii') === 'MZ'
  } finally {
    fs.closeSync(file)
  }
}

async function latestYtDlpAssets() {
  const response = await fetchTrustedGithubRelease(YT_DLP_RELEASE_API, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'ClipVault',
    },
  })
  if (!response.ok || !isTrustedGithubReleaseUrl(response.url)) {
    throw new Error('Không thể kiểm tra bản yt-dlp chính thức mới nhất.')
  }

  const release = await response.json()
  const assets = Array.isArray(release.assets) ? release.assets : []
  const executable = assets.find((asset) => asset?.name === 'yt-dlp.exe')
  const checksums = assets.find((asset) => asset?.name === 'SHA2-256SUMS')
  if (!executable?.browser_download_url || !checksums?.browser_download_url || !isTrustedGithubReleaseUrl(executable.browser_download_url) || !isTrustedGithubReleaseUrl(checksums.browser_download_url)) {
    throw new Error('Bản phát hành yt-dlp không có đủ tệp cần thiết.')
  }
  if (!Number.isSafeInteger(executable.size) || executable.size < 1024 * 1024 || executable.size > MAX_YT_DLP_DOWNLOAD_BYTES) {
    throw new Error('Kích thước tệp yt-dlp không hợp lệ.')
  }
  return { executable, checksums }
}

async function expectedAssetChecksum(url, assetName, label) {
  const response = await fetchTrustedGithubRelease(url)
  if (!response.ok || !isTrustedGithubReleaseUrl(response.url)) {
    throw new Error(`Không thể xác minh tệp kiểm tra ${label}.`)
  }
  const expression = new RegExp(`^([a-fA-F0-9]{64})\\s+\\*?${escapeRegExp(assetName)}$`, 'i')
  const entry = (await response.text())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => expression.test(line))
  if (!entry) throw new Error(`Không tìm thấy mã kiểm tra cho ${assetName}.`)
  return entry.match(/^([a-fA-F0-9]{64})/)[1].toLowerCase()
}

async function downloadReleaseAsset(url, destination, { expectedSize, maximumBytes, label }) {
  const response = await fetchTrustedGithubRelease(url, { timeoutMs: RELEASE_ASSET_FETCH_TIMEOUT_MS })
  if (!response.ok || !response.body || !isTrustedGithubReleaseUrl(response.url)) {
    throw new Error(`Không thể tải ${label} từ nguồn đã xác minh.`)
  }
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength && ((expectedSize && contentLength !== expectedSize) || contentLength > maximumBytes)) {
    throw new Error(`Kích thước tệp ${label} nhận được không hợp lệ.`)
  }

  let byteCount = 0
  const checksum = crypto.createHash('sha256')
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      byteCount += chunk.length
      if (byteCount > maximumBytes) {
        callback(new Error(`Tệp ${label} nhận được lớn bất thường.`))
        return
      }
      checksum.update(chunk)
      callback(null, chunk)
    },
  })

  await pipeline(
    Readable.fromWeb(response.body),
    limiter,
    fs.createWriteStream(destination, { flags: 'wx', mode: 0o755 }),
  )
  return { byteCount, checksum: checksum.digest('hex') }
}

async function installYtDlp() {
  if (process.platform !== 'win32') throw new Error('Tự cài yt-dlp hiện chỉ khả dụng trên Windows.')
  if (activeJob) throw new Error('Hãy đợi lượt tải hiện tại hoàn tất trước khi cập nhật yt-dlp.')
  if (ffmpegInstallation) throw new Error('FFmpeg đang được cài hoặc cập nhật. Hãy đợi một lát.')
  if (downloaderInstallation) return downloaderInstallation

  downloaderInstallation = (async () => {
    const destination = managedYtDlpPath()
    const directory = path.dirname(destination)
    const temporaryFile = path.join(directory, `${ytDlpFileName()}.${crypto.randomUUID()}.partial.exe`)
    const backupFile = `${destination}.previous`
    let backupCreated = false
    let replacementCreated = false
    let installationCommitted = false

    try {
      fs.mkdirSync(directory, { recursive: true })
      const { executable, checksums } = await latestYtDlpAssets()
      const expectedChecksum = await expectedAssetChecksum(checksums.browser_download_url, 'yt-dlp.exe', 'yt-dlp')
      const apiChecksum = releaseAssetDigest(executable)
      if (apiChecksum && apiChecksum !== expectedChecksum) throw new Error('Mã kiểm tra yt-dlp không khớp giữa hai nguồn phát hành.')
      const downloaded = await downloadReleaseAsset(executable.browser_download_url, temporaryFile, {
        expectedSize: executable.size,
        maximumBytes: MAX_YT_DLP_DOWNLOAD_BYTES,
        label: 'yt-dlp',
      })
      if (downloaded.byteCount !== executable.size || downloaded.checksum !== expectedChecksum) {
        throw new Error('Tệp yt-dlp tải về không vượt qua kiểm tra bảo mật.')
      }
      if (!hasWindowsExecutableHeader(temporaryFile)) {
        throw new Error('Tệp yt-dlp tải về không hợp lệ.')
      }
      await ytDlpVersion(temporaryFile)

      if (fs.existsSync(backupFile)) fs.rmSync(backupFile, { force: true })
      if (fs.existsSync(destination)) {
        fs.renameSync(destination, backupFile)
        backupCreated = true
      }
      fs.renameSync(temporaryFile, destination)
      replacementCreated = true

      const status = await ytDlpStatus()
      if (!status.ready || status.source !== 'installed') throw new Error(status.detail)
      installationCommitted = true
      if (backupCreated && fs.existsSync(backupFile)) {
        try {
          fs.rmSync(backupFile, { force: true })
        } catch (cleanupError) {
          console.warn('[ClipVault] Không thể dọn bản yt-dlp cũ:', cleanupError.message || cleanupError)
        }
      }
      return status
    } catch (error) {
      if (!installationCommitted) {
        if (backupCreated && fs.existsSync(backupFile)) {
          if (replacementCreated && fs.existsSync(destination)) fs.rmSync(destination, { force: true })
          fs.renameSync(backupFile, destination)
        } else if (replacementCreated && fs.existsSync(destination)) {
          fs.rmSync(destination, { force: true })
        }
      }
      throw error
    } finally {
      if (fs.existsSync(temporaryFile)) fs.rmSync(temporaryFile, { force: true })
    }
  })()

  try {
    return await downloaderInstallation
  } finally {
    downloaderInstallation = null
  }
}

function managedFfmpegDirectory() {
  return path.join(app.getPath('userData'), 'tools', 'ffmpeg')
}

function ffmpegPaths(directory = managedFfmpegDirectory()) {
  const binaryDirectory = path.join(directory, 'bin')
  return {
    directory: binaryDirectory,
    ffmpeg: path.join(binaryDirectory, 'ffmpeg.exe'),
    ffprobe: path.join(binaryDirectory, 'ffprobe.exe'),
  }
}

async function commandVersion(executablePath, args, label) {
  const { stdout } = await execFileAsync(executablePath, args, {
    windowsHide: true,
    timeout: TOOL_COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  })
  const output = String(stdout || '').trim()
  if (!output) throw new Error(`${label} không trả về thông tin phiên bản.`)
  return output
}

async function ffmpegVersion(executablePath) {
  const output = await commandVersion(executablePath, ['-version'], 'FFmpeg')
  const firstLine = output.split(/\r?\n/).find(Boolean)?.trim() || ''
  const version = firstLine.replace(/^ffmpeg version\s+/i, '').split(/\s+/)[0]
  if (!version) throw new Error('Không thể đọc phiên bản FFmpeg.')
  return version
}

async function validateFfmpegPair(ffmpegPath, ffprobePath) {
  const version = await ffmpegVersion(ffmpegPath)
  await commandVersion(ffprobePath, ['-version'], 'ffprobe')
  return version
}

async function workingFfmpeg() {
  const managed = ffmpegPaths()
  if (!fs.existsSync(managed.ffmpeg) || !fs.existsSync(managed.ffprobe)) {
    return { directory: null, ffmpeg: null, ffprobe: null, source: null, version: null, error: null }
  }
  try {
    return { ...managed, source: 'installed', version: await validateFfmpegPair(managed.ffmpeg, managed.ffprobe) }
  } catch (error) {
    return { directory: null, ffmpeg: null, ffprobe: null, source: null, version: null, error }
  }
}

async function ffmpegStatus() {
  const candidate = await workingFfmpeg()
  if (!candidate.ffmpeg) {
    const detail = candidate.error
      ? 'FFmpeg đã cài không chạy được. Hãy cài lại FFmpeg từ mục Cài đặt.'
      : 'Chưa có FFmpeg do ClipVault quản lý. Cài FFmpeg để ghép hình và tiếng ở chất lượng cao nhất.'
    return { ready: false, source: null, version: null, detail }
  }
  return {
    ready: true,
    source: candidate.source,
    version: candidate.version,
    detail: `FFmpeg ${candidate.version}${candidate.source === 'installed' ? ' · Bản đã cài' : ' · Có sẵn trên máy'}`,
  }
}

async function latestFfmpegAssets() {
  const response = await fetchTrustedGithubRelease(FFMPEG_RELEASE_API, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'ClipVault',
    },
  })
  if (!response.ok || !isTrustedGithubReleaseUrl(response.url)) {
    throw new Error('Không thể kiểm tra bản FFmpeg tương thích mới nhất.')
  }

  const release = await response.json()
  const assets = Array.isArray(release.assets) ? release.assets : []
  const archive = assets.find((asset) => asset?.name === FFMPEG_ARCHIVE_NAME)
  const checksums = assets.find((asset) => asset?.name === FFMPEG_CHECKSUMS_NAME)
  if (!archive?.browser_download_url || !checksums?.browser_download_url || !isTrustedGithubReleaseUrl(archive.browser_download_url) || !isTrustedGithubReleaseUrl(checksums.browser_download_url)) {
    throw new Error('Bản phát hành FFmpeg không có đủ tệp cần thiết.')
  }
  if (!Number.isSafeInteger(archive.size) || archive.size < 50 * 1024 * 1024 || archive.size > MAX_FFMPEG_ARCHIVE_BYTES) {
    throw new Error('Kích thước gói FFmpeg không hợp lệ.')
  }
  return { archive, checksums }
}

function ffmpegArchiveEntryName(fileName) {
  const normalized = String(fileName).replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error('Gói FFmpeg có đường dẫn tệp không an toàn.')
  }
  const match = normalized.match(/(?:^|\/)bin\/(ffmpeg|ffprobe)\.exe$/i)
  return match ? match[1].toLowerCase() : null
}

function isZipSymlink(entry) {
  return ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000
}

async function extractFfmpegExecutables(archivePath, destinationDirectory) {
  fs.mkdirSync(destinationDirectory, { recursive: true })

  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { autoClose: true, lazyEntries: true, validateEntrySizes: true }, (openError, zip) => {
      if (openError) {
        reject(new Error(`Không thể mở gói FFmpeg: ${openError.message || openError}`))
        return
      }

      const extracted = new Set()
      let settled = false
      const closeZip = () => { try { zip.close() } catch {} }
      const fail = (error) => {
        if (settled) return
        settled = true
        closeZip()
        reject(error)
      }
      const next = () => {
        if (settled) return
        if (extracted.size === 2) {
          settled = true
          closeZip()
          resolve(ffmpegPaths(path.dirname(destinationDirectory)))
          return
        }
        zip.readEntry()
      }

      zip.on('error', fail)
      zip.on('entry', (entry) => {
        if (settled) return

        let executableName
        try {
          executableName = ffmpegArchiveEntryName(entry.fileName)
        } catch (error) {
          fail(error)
          return
        }
        if (!executableName) {
          zip.readEntry()
          return
        }
        if (isZipSymlink(entry) || extracted.has(executableName)) {
          fail(new Error('Gói FFmpeg có tệp thực thi không hợp lệ hoặc bị lặp.'))
          return
        }
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize <= 0 || entry.uncompressedSize > MAX_FFMPEG_BINARY_BYTES) {
          fail(new Error('Tệp thực thi FFmpeg trong gói có kích thước không hợp lệ.'))
          return
        }

        const destination = path.join(destinationDirectory, `${executableName}.exe`)
        zip.openReadStream(entry, (streamError, input) => {
          if (streamError) {
            fail(streamError)
            return
          }
          let byteCount = 0
          const limiter = new Transform({
            transform(chunk, _encoding, callback) {
              byteCount += chunk.length
              if (byteCount > MAX_FFMPEG_BINARY_BYTES) {
                callback(new Error('Tệp thực thi FFmpeg lớn bất thường.'))
                return
              }
              callback(null, chunk)
            },
          })

          pipeline(input, limiter, fs.createWriteStream(destination, { flags: 'wx', mode: 0o755 }))
            .then(() => {
              if (byteCount !== entry.uncompressedSize) {
                fail(new Error('Không thể giải nén đầy đủ tệp thực thi FFmpeg.'))
                return
              }
              extracted.add(executableName)
              next()
            })
            .catch(fail)
        })
      })
      zip.on('end', () => {
        if (!settled) fail(new Error('Gói FFmpeg không có đủ ffmpeg.exe và ffprobe.exe.'))
      })
      zip.readEntry()
    })
  })
}

async function installFfmpeg() {
  if (process.platform !== 'win32') throw new Error('Tự cài FFmpeg hiện chỉ khả dụng trên Windows.')
  if (activeJob) throw new Error('Hãy đợi lượt tải hiện tại hoàn tất trước khi cài FFmpeg.')
  if (downloaderInstallation) throw new Error('yt-dlp đang được cài hoặc cập nhật. Hãy đợi một lát.')
  if (ffmpegInstallation) return ffmpegInstallation

  ffmpegInstallation = (async () => {
    const destinationDirectory = managedFfmpegDirectory()
    const toolsDirectory = path.dirname(destinationDirectory)
    const installationId = crypto.randomUUID()
    const temporaryArchive = path.join(toolsDirectory, `ffmpeg.${installationId}.partial.zip`)
    const stageDirectory = path.join(toolsDirectory, `.ffmpeg-stage-${installationId}`)
    const backupDirectory = path.join(toolsDirectory, `.ffmpeg-backup-${installationId}`)
    let backupCreated = false
    let replacementCreated = false
    let installationCommitted = false

    try {
      fs.mkdirSync(toolsDirectory, { recursive: true })
      const { archive, checksums } = await latestFfmpegAssets()
      const expectedChecksum = await expectedAssetChecksum(checksums.browser_download_url, FFMPEG_ARCHIVE_NAME, 'FFmpeg')
      const apiChecksum = releaseAssetDigest(archive)
      if (apiChecksum && apiChecksum !== expectedChecksum) throw new Error('Mã kiểm tra FFmpeg không khớp giữa hai nguồn phát hành.')
      const downloaded = await downloadReleaseAsset(archive.browser_download_url, temporaryArchive, {
        expectedSize: archive.size,
        maximumBytes: MAX_FFMPEG_ARCHIVE_BYTES,
        label: 'FFmpeg',
      })
      if (downloaded.byteCount !== archive.size || downloaded.checksum !== expectedChecksum) {
        throw new Error('Gói FFmpeg tải về không vượt qua kiểm tra bảo mật.')
      }

      const staged = await extractFfmpegExecutables(temporaryArchive, path.join(stageDirectory, 'bin'))
      if (!hasWindowsExecutableHeader(staged.ffmpeg) || !hasWindowsExecutableHeader(staged.ffprobe)) {
        throw new Error('Tệp thực thi FFmpeg tải về không hợp lệ.')
      }
      await validateFfmpegPair(staged.ffmpeg, staged.ffprobe)

      if (fs.existsSync(destinationDirectory)) {
        fs.renameSync(destinationDirectory, backupDirectory)
        backupCreated = true
      }
      fs.renameSync(stageDirectory, destinationDirectory)
      replacementCreated = true

      const status = await ffmpegStatus()
      if (!status.ready || status.source !== 'installed') throw new Error(status.detail)
      installationCommitted = true
      if (backupCreated && fs.existsSync(backupDirectory)) {
        try {
          fs.rmSync(backupDirectory, { recursive: true, force: true })
        } catch (cleanupError) {
          console.warn('[ClipVault] Không thể dọn bản FFmpeg cũ:', cleanupError.message || cleanupError)
        }
      }
      return status
    } catch (error) {
      if (!installationCommitted) {
        if (backupCreated && fs.existsSync(backupDirectory)) {
          if (replacementCreated && fs.existsSync(destinationDirectory)) fs.rmSync(destinationDirectory, { recursive: true, force: true })
          fs.renameSync(backupDirectory, destinationDirectory)
        } else if (replacementCreated && fs.existsSync(destinationDirectory)) {
          fs.rmSync(destinationDirectory, { recursive: true, force: true })
        }
      }
      throw error
    } finally {
      if (fs.existsSync(temporaryArchive)) fs.rmSync(temporaryArchive, { force: true })
      if (fs.existsSync(stageDirectory)) fs.rmSync(stageDirectory, { recursive: true, force: true })
    }
  })()

  try {
    return await ffmpegInstallation
  } finally {
    ffmpegInstallation = null
  }
}

function processOutput(job, sender, sourceUrl, chunk) {
  for (const rawLine of String(chunk).split(/\r?\n/)) {
    const line = cleanOutput(rawLine)
    if (!line) continue
    const accessMessage = accessRequirementMessage(job.request.platform, line)
    if (accessMessage) {
      job.currentFailureMessage = accessMessage
      send(sender, 'downloads:log', { jobId: job.id, text: accessMessage, sourceUrl })
      continue
    }
    const percentage = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
    if (percentage) {
      send(sender, 'downloads:progress', {
        jobId: job.id,
        percent: Math.min(100, Math.round(Number(percentage[1]))),
        detail: line.replace(/^\[download\]\s*/, ''),
      })
    }
    if (line.includes('Destination:') || line.includes('Merging formats')) {
      send(sender, 'downloads:status', { jobId: job.id, text: line.replace(/^\[[^\]]+\]\s*/, '') })
    }
    send(sender, 'downloads:log', { jobId: job.id, text: line, sourceUrl })
  }
}

async function downloadOne(job, sender, sourceUrl) {
  job.currentFailureMessage = null
  send(sender, 'downloads:status', { jobId: job.id, text: `Đang xử lý ${sourceUrl}` })
  const downloadUrl = normalizedDownloadUrl(job.request.platform, sourceUrl)
  if (downloadUrl !== sourceUrl) {
    send(sender, 'downloads:status', { jobId: job.id, text: 'Đang dùng liên kết RedNote tương thích…' })
  }
  const child = youtubedl.create(job.ytDlpPath).exec(downloadUrl, downloadFlags(job.request, job.ffmpegDirectory), { windowsHide: true })
  job.child = child
  child.stdout?.on('data', (chunk) => processOutput(job, sender, sourceUrl, chunk))
  child.stderr?.on('data', (chunk) => processOutput(job, sender, sourceUrl, chunk))
  try {
    await child
  } catch (error) {
    throw new Error(conciseDownloadError(error, job.request.platform, job.currentFailureMessage))
  } finally {
    job.child = null
  }
}

async function runJob(job, sender) {
  let processedSources = 0
  let failedSources = 0
  try {
    fs.mkdirSync(path.join(job.request.outputDir, '.clipvault-archive'), { recursive: true })
    if (job.request.quality === 'best') {
      const detail = job.ffmpegSource
        ? 'Đang ưu tiên chất lượng hình và tiếng cao nhất, ghép bằng FFmpeg…'
        : 'FFmpeg chưa sẵn sàng; đang chỉ chọn video đã có sẵn cả hình và tiếng để tránh mất tiếng…'
      send(sender, 'downloads:status', { jobId: job.id, text: detail })
    }
    for (const sourceUrl of job.request.urls) {
      if (job.cancelled) break
      try {
        await downloadOne(job, sender, sourceUrl)
        processedSources += 1
      } catch (error) {
        if (job.cancelled) break
        failedSources += 1
        const message = conciseDownloadError(error, job.request.platform, job.currentFailureMessage)
        send(sender, 'downloads:log', { jobId: job.id, text: `Không thể xử lý ${sourceUrl}: ${message}`, sourceUrl })
        if (job.request.mode !== 'multiple') throw new Error(message)
      }
    }
    if (job.cancelled) {
      send(sender, 'downloads:cancelled', { jobId: job.id })
    } else {
      send(sender, 'downloads:completed', { jobId: job.id, processedSources, failedSources })
    }
  } catch (error) {
    if (job.cancelled) send(sender, 'downloads:cancelled', { jobId: job.id })
    else send(sender, 'downloads:failed', { jobId: job.id, message: error.message || 'Không thể tải nội dung này.' })
  } finally {
    if (activeJob?.id === job.id) activeJob = null
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    // Show immediately so a slow first paint cannot leave the app invisible.
    show: true,
    backgroundColor: '#0b1020',
    title: 'ClipVault',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The host's Windows child-process sandbox cannot load its GPU runtime.
      // Keep the other renderer isolation controls enabled.
      sandbox: process.platform !== 'win32',
    },
  })
  mainWindow = window

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    reportStartupError(new Error(`Không thể nạp tệp khởi động ${preloadPath}: ${error?.message || error}`))
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame) {
      reportStartupError(new Error(`Không thể nạp giao diện (${errorCode}): ${errorDescription} — ${validatedUrl}`))
    }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    reportStartupError(new Error(`Giao diện đã dừng (${details.reason}, mã ${details.exitCode}).`))
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })
  window.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch(reportStartupError)
}

async function initializeApp() {
  // ClipVault uses its own controls and does not need Electron's Windows menu bar.
  if (process.platform === 'win32') Menu.setApplicationMenu(null)

  ipcMain.handle('folder:default', () => path.join(app.getPath('downloads'), 'ClipVault'))
  ipcMain.handle('folder:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('folder:open', async (_event, folder) => {
    const result = await shell.openPath(path.resolve(String(folder || '')))
    return result || null
  })
  ipcMain.handle('downloader:status', () => ytDlpStatus())
  ipcMain.handle('downloader:install', async () => {
    try {
      const status = await installYtDlp()
      return { ok: true, status }
    } catch (error) {
      return { ok: false, message: error.message || 'Không thể cài yt-dlp.' }
    }
  })
  ipcMain.handle('ffmpeg:status', () => ffmpegStatus())
  ipcMain.handle('ffmpeg:install', async () => {
    try {
      const status = await installFfmpeg()
      return { ok: true, status }
    } catch (error) {
      return { ok: false, message: error.message || 'Không thể cài FFmpeg.' }
    }
  })
  ipcMain.handle('downloads:start', async (event, payload) => {
    if (activeJob) return { ok: false, message: 'Đang có một lượt tải khác chạy.' }
    if (downloaderInstallation || ffmpegInstallation) return { ok: false, message: 'Một công cụ đang được cài hoặc cập nhật. Hãy đợi một lát.' }
    try {
      const request = validateRequest(payload)
      const downloader = await workingYtDlp()
      const ffmpeg = await workingFfmpeg()
      if (downloaderInstallation || ffmpegInstallation) {
        return { ok: false, message: 'Một công cụ đang được cài hoặc cập nhật. Hãy đợi một lát.' }
      }
      if (!downloader.path) {
        return { ok: false, message: 'Chưa có yt-dlp hoạt động. Hãy mở Cài đặt để kiểm tra hoặc cài công cụ này.' }
      }
      const job = {
        id: crypto.randomUUID(),
        request,
        ytDlpPath: downloader.path,
        ffmpegDirectory: ffmpeg.directory,
        ffmpegSource: ffmpeg.source,
        child: null,
        cancelled: false,
      }
      activeJob = job
      void runJob(job, event.sender)
      return { ok: true, jobId: job.id }
    } catch (error) {
      return { ok: false, message: error.message || 'Yêu cầu không hợp lệ.' }
    }
  })
  ipcMain.handle('downloads:cancel', () => {
    if (!activeJob) return false
    activeJob.cancelled = true
    if (typeof activeJob.child?.cancel === 'function') activeJob.child.cancel()
    else activeJob.child?.kill()
    return true
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}

app.whenReady().then(initializeApp).catch(reportStartupError)

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
