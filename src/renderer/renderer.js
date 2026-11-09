const platforms = {
  facebook: { label: 'Facebook', accent: '#4f8cff', rgb: '79, 140, 255', glyph: 'f', title: 'Facebook video desk', headline: 'Lưu video công khai của bạn, gọn gàng.', description: 'Tải một Reel/video, nhiều URL, hoặc toàn bộ video công khai từ một trang bạn có quyền quản lý.', domains: ['facebook.com', 'fb.watch'] },
  youtube: { label: 'YouTube', accent: '#ff5b68', rgb: '255, 91, 104', glyph: '▶', title: 'YouTube video desk', headline: 'Gom video và Shorts vào thư viện riêng.', description: 'Lưu từng video, nhiều liên kết, hoặc playlist/kênh công khai mà bạn được phép lưu.', domains: ['youtube.com', 'youtu.be'] },
  tiktok: { label: 'TikTok', accent: '#8f73ff', rgb: '143, 115, 255', glyph: '♪', title: 'TikTok media desk', headline: 'Lưu video và ảnh công khai có tổ chức.', description: 'Dán URL video hoặc bài đăng ảnh công khai bạn sở hữu hay được cấp quyền tải.', domains: ['tiktok.com'] },
  x: { label: 'X', accent: '#dbe6fa', rgb: '219, 230, 250', glyph: '𝕏', title: 'X video desk', headline: 'Lưu video X công khai, gọn gàng.', description: 'Tải một video hoặc nhiều liên kết X công khai mà bạn sở hữu hoặc được cấp quyền lưu.', domains: ['x.com', 'twitter.com'] },
  rednote: { label: 'RedNote', accent: '#ef4d64', rgb: '239, 77, 100', glyph: 'R', title: 'RedNote media desk', headline: 'Lưu video và ảnh RedNote công khai.', description: 'Tải video, ảnh trong bài đăng, nhiều URL hoặc nội dung RedNote công khai bạn sở hữu hay được cấp quyền lưu.', domains: ['rednote.com', 'xiaohongshu.com', 'xhslink.com'] },
}

const state = { platform: 'facebook', mode: 'single', outputDir: '', busy: false, installingTool: null, toastTimer: null, previewRequestId: 0 }
const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function showToast(message, error = false) {
  const toast = $('#toast')
  toast.textContent = message
  toast.classList.toggle('is-error', error)
  toast.classList.add('is-visible')
  clearTimeout(state.toastTimer)
  state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4200)
}

function setStatus(text, kind = '') {
  const badge = $('#status-badge')
  badge.textContent = text
  badge.className = `status-badge ${kind}`.trim()
}

function setToolChecking() {
  $('#tool-status-badge').textContent = 'Đang kiểm tra…'
  $('#tool-status-badge').className = 'tool-status is-checking'
  $('#tool-status-detail').textContent = 'Đang kiểm tra công cụ tải video trên máy này.'
  $('#settings-tool-dot').className = 'settings-dot is-checking'
  $('#settings-tool-dot').setAttribute('aria-label', 'Đang kiểm tra yt-dlp')
}

function setToolStatus(status) {
  const ready = Boolean(status?.ready)
  const installed = status?.source === 'installed'
  const badge = $('#tool-status-badge')
  const dot = $('#settings-tool-dot')

  badge.textContent = ready ? `${installed ? 'Đã cài' : 'Có sẵn'} · sẵn sàng` : 'Chưa sẵn sàng'
  badge.className = `tool-status ${ready ? 'is-ready' : 'is-error'}`
  $('#tool-status-detail').textContent = status?.detail || (ready ? 'yt-dlp đã sẵn sàng.' : 'Không thể kiểm tra yt-dlp.')
  $('#install-tool').textContent = ready && installed ? 'Cập nhật yt-dlp' : 'Cài / cập nhật yt-dlp'
  dot.className = `settings-dot ${ready ? 'is-ready' : 'is-error'}`
  dot.setAttribute('aria-label', ready ? 'yt-dlp sẵn sàng' : 'yt-dlp chưa sẵn sàng')
}

async function refreshDownloaderStatus({ quiet = false } = {}) {
  if (state.installingTool === 'yt-dlp') return null
  setToolChecking()
  try {
    const status = await window.clipVault.downloaderStatus()
    if (state.installingTool === 'yt-dlp') return null
    setToolStatus(status)
    return status
  } catch (error) {
    if (state.installingTool === 'yt-dlp') return null
    const message = error?.message || 'Không thể kiểm tra yt-dlp.'
    setToolStatus({ ready: false, detail: message })
    if (!quiet) showToast(message, true)
    return null
  }
}

function setFfmpegChecking() {
  $('#ffmpeg-status-badge').textContent = 'Đang kiểm tra…'
  $('#ffmpeg-status-badge').className = 'tool-status is-checking'
  $('#ffmpeg-status-detail').textContent = 'Đang kiểm tra FFmpeg do ClipVault quản lý.'
}

function setFfmpegStatus(status) {
  const ready = Boolean(status?.ready)
  const installed = status?.source === 'installed'
  const badge = $('#ffmpeg-status-badge')

  badge.textContent = ready ? `${installed ? 'Đã cài' : 'Có sẵn'} · sẵn sàng` : 'Chưa sẵn sàng'
  badge.className = `tool-status ${ready ? 'is-ready' : 'is-error'}`
  $('#ffmpeg-status-detail').textContent = status?.detail || (ready ? 'FFmpeg và ffprobe đã sẵn sàng.' : 'Không thể kiểm tra FFmpeg.')
  $('#install-ffmpeg').textContent = ready && installed ? 'Cập nhật FFmpeg' : 'Cài FFmpeg'
}

async function refreshFfmpegStatus({ quiet = false } = {}) {
  if (state.installingTool === 'ffmpeg') return null
  setFfmpegChecking()
  try {
    const status = await window.clipVault.ffmpegStatus()
    if (state.installingTool === 'ffmpeg') return null
    setFfmpegStatus(status)
    return status
  } catch (error) {
    if (state.installingTool === 'ffmpeg') return null
    const message = error?.message || 'Không thể kiểm tra FFmpeg.'
    setFfmpegStatus({ ready: false, detail: message })
    if (!quiet) showToast(message, true)
    return null
  }
}

function refreshToolStatuses(options = {}) {
  return Promise.all([
    refreshDownloaderStatus(options),
    refreshFfmpegStatus(options),
  ])
}

function addLog(text) {
  const log = $('#activity-log')
  log.querySelector('.log-empty')?.remove()
  const line = document.createElement('div')
  line.className = 'log-line'
  line.innerHTML = `<span>›</span> ${escapeHtml(text)}`
  log.append(line)
  while (log.children.length > 80) log.firstElementChild.remove()
  log.scrollTop = log.scrollHeight
}

function setBusy(busy) {
  state.busy = busy
  const controlsLocked = busy || isToolInstallRunning()
  $('#start-download').disabled = controlsLocked
  $('#clear-form').disabled = controlsLocked
  $('#choose-folder').disabled = controlsLocked
  $('#open-folder').disabled = controlsLocked
  $('#cancel-download').disabled = !busy
  $('#start-download').innerHTML = busy ? '<span>◌</span> Đang tải…' : '<span>↓</span> Bắt đầu tải'
  $('#install-tool').disabled = controlsLocked
  $('#refresh-tool-status').disabled = isToolInstallRunning()
  $('#install-ffmpeg').disabled = controlsLocked
  $('#refresh-ffmpeg-status').disabled = isToolInstallRunning()
  $$('.platform-button, .mode-tab, input, textarea, select').forEach((element) => {
    if (element.id !== 'cancel-download') element.disabled = controlsLocked
  })
}

function isToolInstallRunning() {
  return state.installingTool !== null
}

function setToolInstalling(tool = null) {
  state.installingTool = tool
  setBusy(state.busy)
}

function selectPlatform(key) {
  if (state.busy || isToolInstallRunning()) return
  const platform = platforms[key]
  if (!platform) return
  state.platform = key
  document.documentElement.style.setProperty('--accent', platform.accent)
  document.documentElement.style.setProperty('--accent-rgb', platform.rgb)
  $$('.platform-button').forEach((button) => button.classList.toggle('is-active', button.dataset.platform === key))
  $('#page-title').textContent = platform.title
  $('#platform-kicker').innerHTML = `<span></span> ${platform.label.toUpperCase()}`
  $('#hero-title').textContent = platform.headline
  $('#hero-description').textContent = platform.description
  $('#activity-platform').textContent = platform.label
  $('#media-glyph').textContent = platform.glyph
  updatePlaceholders()
}

function updatePlaceholders() {
  const label = platforms[state.platform].label
  $('#single-url').placeholder = `Dán URL ${label} công khai vào đây`
  $('#multiple-urls').placeholder = `Mỗi dòng một URL ${label} công khai…`
  $('#collection-url').placeholder = `Dán URL trang/kênh ${label} công khai`
}

function selectMode(mode) {
  if (state.busy || isToolInstallRunning()) return
  state.mode = mode
  $$('.mode-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.mode === mode))
  $$('.mode-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === mode))
}

function urlsForCurrentMode() {
  const source = state.mode === 'single' ? $('#single-url').value : state.mode === 'multiple' ? $('#multiple-urls').value : $('#collection-url').value
  return [...new Set(source.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))]
}

function validateUrls(urls) {
  const platform = platforms[state.platform]
  if (!urls.length) throw new Error('Hãy dán ít nhất một URL công khai.')
  if (state.mode === 'collection' && urls.length !== 1) throw new Error('Chế độ trang/kênh chỉ nhận một URL.')
  for (const value of urls) {
    let parsed
    try { parsed = new URL(value) } catch { throw new Error(`URL không hợp lệ: ${value}`) }
    const host = parsed.hostname.toLowerCase()
    const matchesPlatform = platform.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    if (!['http:', 'https:'].includes(parsed.protocol) || !matchesPlatform) throw new Error(`URL không thuộc ${platform.label}: ${value}`)
  }
}

async function startDownload() {
  if (state.busy) return
  if (isToolInstallRunning()) return showToast('Một công cụ đang được cài hoặc cập nhật. Hãy đợi một lát.', true)
  try {
    if (!state.outputDir) throw new Error('Hãy chọn thư mục lưu trước.')
    const urls = urlsForCurrentMode()
    validateUrls(urls)
    const response = await window.clipVault.startDownload({
      platform: state.platform,
      mode: state.mode,
      urls,
      outputDir: state.outputDir,
      maxItems: $('#max-items').value,
      quality: $('#quality').value,
      skipExisting: $('#skip-existing').checked,
    })
    if (!response.ok) throw new Error(response.message)
    setBusy(true)
    setStatus('Đang tải', 'is-busy')
    $('#activity-title').textContent = state.mode === 'collection' ? 'Đang quét trang/kênh công khai' : `${urls.length} URL đang chờ`
    $('#progress-bar').style.width = '0%'
    $('#progress-percent').textContent = '0%'
    $('#progress-detail').textContent = 'Đang khởi tạo lượt tải…'
    addLog(`Bắt đầu tải ${urls.length} nguồn ${platforms[state.platform].label}.`)
  } catch (error) {
    showToast(error.message || 'Không thể bắt đầu tải.', true)
  }
}
async function previewVideo() {
  try {
    const url = $('#single-url').value.trim()
    validateUrls([url])
    const requestId = ++state.previewRequestId
    const player = $('#preview-player')
    player.pause(); player.removeAttribute('src'); player.load()
    $('#preview-modal').hidden = false; $('#preview-title').textContent = 'Đang chuẩn bị xem trước…'; $('#preview-detail').textContent = ''
    const response = await window.clipVault.loadPreview({ platform: state.platform, url })
    if (requestId !== state.previewRequestId) return
    if (!response?.ok || !response.preview?.url) throw new Error(response?.message || 'Nguồn không cung cấp video xem trước.')
    $('#preview-title').textContent = response.preview.title; player.src = response.preview.url; player.load(); $('#preview-detail').textContent = 'Video chỉ được phát thử, chưa tải về máy.'
  } catch (error) { $('#preview-modal').hidden = true; showToast(error.message || 'Không thể xem trước video.', true) }
}

function resetForm() {
  if (state.busy || isToolInstallRunning()) return
  $('#single-url').value = ''
  $('#multiple-urls').value = ''
  $('#collection-url').value = ''
  $('#max-items').value = '0'
  $('#quality').value = 'best'
  $('#skip-existing').checked = true
  $('#progress-bar').style.width = '0%'
  $('#progress-percent').textContent = '0%'
  $('#progress-detail').textContent = 'Biểu mẫu đã được làm mới.'
  showToast('Đã làm mới biểu mẫu.')
}

async function chooseFolder() {
  if (state.busy || isToolInstallRunning()) return
  const folder = await window.clipVault.chooseFolder()
  if (folder) {
    state.outputDir = folder
    $('#output-folder').textContent = folder
  }
}

async function openFolder() {
  if (isToolInstallRunning()) return
  if (!state.outputDir) return showToast('Chưa có thư mục lưu.', true)
  const error = await window.clipVault.openFolder(state.outputDir)
  if (error) showToast(error, true)
}

function openSettings() {
  $('#settings-modal').hidden = false
  $('#close-settings').focus()
  void refreshToolStatuses({ quiet: true })
}

function closeSettings() {
  $('#settings-modal').hidden = true
  $('#open-settings').focus()
}

async function installDownloader() {
  if (state.busy) return showToast('Hãy đợi lượt tải hiện tại hoàn tất trước khi cập nhật yt-dlp.', true)
  if (isToolInstallRunning()) return

  setToolInstalling('yt-dlp')
  $('#install-tool').textContent = 'Đang cài…'
  $('#tool-status-badge').textContent = 'Đang cài…'
  $('#tool-status-badge').className = 'tool-status is-checking'
  $('#tool-status-detail').textContent = 'Đang tải và kiểm tra bản yt-dlp chính thức.'
  $('#settings-tool-dot').className = 'settings-dot is-checking'
  $('#settings-tool-dot').setAttribute('aria-label', 'Đang cài yt-dlp')

  try {
    const response = await window.clipVault.installDownloader()
    if (!response?.ok) throw new Error(response?.message || 'Không thể cài yt-dlp.')
    setToolStatus(response.status)
    showToast('yt-dlp đã sẵn sàng để tải video.')
  } catch (error) {
    const message = error?.message || 'Không thể cài yt-dlp.'
    setToolStatus({ ready: false, detail: message })
    showToast(message, true)
  } finally {
    setToolInstalling()
    await refreshToolStatuses({ quiet: true })
  }
}

async function installFfmpeg() {
  if (state.busy) return showToast('Hãy đợi lượt tải hiện tại hoàn tất trước khi cài FFmpeg.', true)
  if (isToolInstallRunning()) return

  setToolInstalling('ffmpeg')
  $('#install-ffmpeg').textContent = 'Đang cài…'
  $('#ffmpeg-status-badge').textContent = 'Đang cài…'
  $('#ffmpeg-status-badge').className = 'tool-status is-checking'
  $('#ffmpeg-status-detail').textContent = 'Đang tải, kiểm tra và cài FFmpeg. Gói này có thể khá lớn.'

  try {
    const response = await window.clipVault.installFfmpeg()
    if (!response?.ok) throw new Error(response?.message || 'Không thể cài FFmpeg.')
    setFfmpegStatus(response.status)
    showToast('FFmpeg đã sẵn sàng cho chất lượng cao nhất.')
  } catch (error) {
    const message = error?.message || 'Không thể cài FFmpeg.'
    setFfmpegStatus({ ready: false, detail: message })
    showToast(message, true)
  } finally {
    setToolInstalling()
    await refreshToolStatuses({ quiet: true })
  }
}

function bindEvents() {
  $$('.platform-button').forEach((button) => button.addEventListener('click', () => selectPlatform(button.dataset.platform)))
  $$('.mode-tab').forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)))
  $('#start-download').addEventListener('click', startDownload)
  $('#preview-video').addEventListener('click', previewVideo)
  $('#close-preview').addEventListener('click', () => { state.previewRequestId += 1; $('#preview-player').pause(); $('#preview-player').removeAttribute('src'); $('#preview-player').load(); $('#preview-modal').hidden = true })
  $$('[data-close-preview]').forEach((element) => element.addEventListener('click', () => { state.previewRequestId += 1; $('#preview-player').pause(); $('#preview-player').removeAttribute('src'); $('#preview-player').load(); $('#preview-modal').hidden = true }))
  $('#clear-form').addEventListener('click', resetForm)
  $('#choose-folder').addEventListener('click', chooseFolder)
  $('#open-folder').addEventListener('click', openFolder)
  $('#open-settings').addEventListener('click', openSettings)
  $('#close-settings').addEventListener('click', closeSettings)
  $$('[data-close-settings]').forEach((element) => element.addEventListener('click', closeSettings))
  $('#refresh-tool-status').addEventListener('click', () => {
    if (!isToolInstallRunning()) void refreshDownloaderStatus()
  })
  $('#install-tool').addEventListener('click', () => { void installDownloader() })
  $('#refresh-ffmpeg-status').addEventListener('click', () => {
    if (!isToolInstallRunning()) void refreshFfmpegStatus()
  })
  $('#install-ffmpeg').addEventListener('click', () => { void installFfmpeg() })
  $('#clear-log').addEventListener('click', () => { $('#activity-log').innerHTML = '<div class="log-empty">Nhật ký đã được làm mới.</div>' })
  $('#cancel-download').addEventListener('click', async () => {
    const cancelled = await window.clipVault.cancelDownload()
    if (cancelled) { setStatus('Đang dừng', 'is-busy'); addLog('Đã gửi yêu cầu dừng lượt tải.') }
  })
  window.clipVault.onProgress(({ percent, detail }) => {
    $('#progress-bar').style.width = `${percent}%`
    $('#progress-percent').textContent = `${percent}%`
    $('#progress-detail').textContent = detail
  })
  window.clipVault.onStatus(({ text }) => { $('#progress-detail').textContent = text })
  window.clipVault.onLog(({ text }) => addLog(text))
  window.clipVault.onCompleted(({ processedSources, failedSources }) => {
    const summary = failedSources ? `Đã xử lý ${processedSources} nguồn, ${failedSources} nguồn lỗi.` : `Đã xử lý ${processedSources} nguồn.`
    setBusy(false); setStatus(failedSources ? 'Hoàn tất có lỗi' : 'Hoàn tất', failedSources ? 'is-error' : ''); $('#progress-bar').style.width = '100%'; $('#progress-percent').textContent = '100%'; $('#progress-detail').textContent = summary; $('#activity-title').textContent = 'Lượt tải hoàn tất'; addLog(`Hoàn tất: ${summary}`); showToast(summary, Boolean(failedSources))
  })
  window.clipVault.onCancelled(() => { setBusy(false); setStatus('Đã dừng'); $('#activity-title').textContent = 'Lượt tải đã dừng'; addLog('Lượt tải đã dừng.'); showToast('Đã dừng lượt tải.') })
  window.clipVault.onFailed(({ message }) => { setBusy(false); setStatus('Có lỗi', 'is-error'); $('#activity-title').textContent = 'Không thể hoàn tất'; addLog(`Lỗi: ${message}`); showToast(message || 'Không thể tải nội dung này.', true) })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#settings-modal').hidden) closeSettings()
  })
}

async function initialize() {
  state.outputDir = await window.clipVault.defaultFolder()
  $('#output-folder').textContent = state.outputDir
  bindEvents()
  selectPlatform('facebook')
  setBusy(false)
  void refreshToolStatuses({ quiet: true })
}

void initialize()
