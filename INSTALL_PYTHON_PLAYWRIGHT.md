# Cài đặt Python & Playwright cho tính năng Douyin

## Tại sao cần cài?

Douyin yêu cầu cookies thật từ trình duyệt đã đăng nhập. Python + Playwright sẽ tự động:
1. Mở trình duyệt
2. Cho bạn đăng nhập Douyin thủ công
3. Lấy cookies và lưu vào ClipVault
4. Tất cả tự động!

## Cài đặt - 3 bước đơn giản

### 🔹 Bước 1: Cài Python

**Tải Python:**
- Website: https://www.python.org/downloads/
- Chọn "Download Python 3.12.x"
- **QUAN TRỌNG:** Tick vào ô **"Add Python to PATH"** khi cài đặt

**Hoặc dùng Windows Package Manager:**
```cmd
winget install Python.Python.3
```

**Kiểm tra đã cài chưa:**
```cmd
python --version
```

Nếu hiển thị `Python 3.x.x` → Thành công! ✅

### 🔹 Bước 2: Cài Playwright

Mở **Command Prompt** hoặc **PowerShell** và chạy:

```cmd
pip install playwright
```

### 🔹 Bước 3: Cài trình duyệt Chromium

```cmd
playwright install chromium
```

⚠️ **Lưu ý:** Lệnh này sẽ tải ~300MB

**Kiểm tra:**
```cmd
python -m playwright --version
```

Nếu hiển thị version → Hoàn tất! ✅

## Cách sử dụng trong ClipVault

### Lần đầu tiên:

1. Mở ClipVault
2. Vào tab **Douyin**
3. Nhấn nút **"🍪 Lấy Cookies Douyin"**
4. Một cửa sổ Command Prompt sẽ xuất hiện
5. Trình duyệt Chromium sẽ mở tự động
6. **Đăng nhập Douyin** trong trình duyệt
7. Sau khi thấy trang chủ Douyin (đã đăng nhập), quay lại cửa sổ Command Prompt
8. **Nhấn Enter**
9. Xong! Cookies đã được lưu

### Từ lần sau:

- Cookies sẽ tự động được dùng khi tải video Douyin
- Không cần lấy lại cho đến khi cookies hết hạn (thường 2-4 tuần)
- Nếu lỗi "Fresh cookies needed" → Lặp lại các bước trên

## Khắc phục sự cố

### ❌ Lỗi: "Python chưa được cài đặt"

**Nguyên nhân:** Python chưa cài hoặc chưa thêm vào PATH

**Giải pháp:**
1. Gỡ cài Python (nếu đã cài)
2. Cài lại và **NHỚ TICK** "Add Python to PATH"
3. Khởi động lại Command Prompt

### ❌ Lỗi: "Playwright chưa được cài đặt"

**Giải pháp:**
```cmd
pip install playwright
playwright install chromium
```

### ❌ Lỗi: "'playwright' is not recognized"

**Giải pháp:**
```cmd
python -m playwright install chromium
```

### ❌ Trình duyệt không mở

**Nguyên nhân:** Firewall/Antivirus chặn

**Giải pháp:**
1. Tạm tắt Antivirus
2. Chạy lại: `playwright install chromium`
3. Thử lại trong ClipVault

### ❌ Cookies không hoạt động

**Giải pháp:**
1. Xóa file cũ: `%LOCALAPPDATA%\ClipVault\douyin-cookies.txt`
2. Lấy cookies lại
3. Đảm bảo bạn **ĐÃ ĐĂNG NHẬP** trước khi nhấn Enter

## File cookies được lưu ở đâu?

```
%LOCALAPPDATA%\ClipVault\douyin-cookies.txt
```

Để mở thư mục:
1. Nhấn **Windows + R**
2. Gõ: `%LOCALAPPDATA%\ClipVault`
3. Nhấn Enter

## Giải pháp thay thế (Không cần Python)

Nếu không muốn cài Python, bạn có thể xuất cookies thủ công:

### Chrome/Edge:
1. Cài extension: **"Get cookies.txt LOCALLY"**
2. Vào https://www.douyin.com và đăng nhập
3. Click icon extension → Export
4. Lưu file thành `douyin-cookies.txt`
5. Copy vào `%LOCALAPPDATA%\ClipVault\`

### Firefox:
1. Cài add-on: **"cookies.txt"**
2. Vào https://www.douyin.com và đăng nhập
3. Click icon add-on → Current Site
4. Lưu file thành `douyin-cookies.txt`
5. Copy vào `%LOCALAPPDATA%\ClipVault\`

👉 **Chi tiết:** Xem `DOUYIN_COOKIES_GUIDE.md`

## Câu hỏi thường gặp

### Q: Cookies có an toàn không?
**A:** Có! Cookies được lưu cục bộ trên máy bạn. ClipVault KHÔNG gửi cookies đi đâu cả.

### Q: Cookies có hết hạn không?
**A:** Có, thường sau 2-4 tuần. Khi hết hạn, chỉ cần lấy lại bằng nút "Lấy Cookies Douyin".

### Q: Có cần đăng nhập lại mỗi lần tải video không?
**A:** Không! Chỉ cần lấy cookies 1 lần, sau đó dùng mãi cho đến khi hết hạn.

### Q: Python/Playwright có nặng không?
**A:** 
- Python: ~50MB
- Playwright: ~50MB
- Chromium: ~300MB
- **Tổng: ~400MB**

### Q: Có thể gỡ Python sau khi lấy cookies không?
**A:** Không nên! Bạn sẽ cần Python để lấy cookies lại khi cookies hết hạn.

### Q: Có cách nào không cần Python?
**A:** Có! Xuất cookies thủ công từ trình duyệt (xem phần "Giải pháp thay thế" ở trên).

## Hỗ trợ thêm

- **Hướng dẫn xuất cookies thủ công:** `DOUYIN_COOKIES_GUIDE.md`
- **Hướng dẫn đầy đủ:** `DOUYIN_SETUP.md`
- **GitHub Issues:** https://github.com/yt-dlp/yt-dlp/issues?q=douyin

---

**Lưu ý bảo mật:**
- ❌ KHÔNG chia sẻ file cookies với người khác
- ❌ KHÔNG upload cookies lên Internet
- ✅ Chỉ dùng cookies trên máy cá nhân
- ✅ Cookies chỉ hoạt động với tài khoản của bạn
