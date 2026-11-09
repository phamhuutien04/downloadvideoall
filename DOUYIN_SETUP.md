# Hướng dẫn cài đặt tính năng Lấy Cookies Douyin tự động

## Tính năng này làm gì?

Tự động mở trình duyệt, đăng nhập Douyin thủ công 1 lần, sau đó ClipVault sẽ lấy cookies thật từ trình duyệt để tải video.

## Yêu cầu

1. **Python 3.8 trở lên**
2. **Playwright** - thư viện tự động hóa trình duyệt

## Cài đặt

### Bước 1: Cài Python

#### Windows:
1. Tải Python từ: https://www.python.org/downloads/
2. **QUAN TRỌNG:** Tick vào ô "Add Python to PATH" khi cài đặt
3. Cài đặt bình thường

Hoặc dùng winget:
```cmd
winget install Python.Python.3.12
```

#### Kiểm tra Python đã cài:
```cmd
python --version
```

Nếu báo lỗi, thử:
```cmd
python3 --version
```

### Bước 2: Cài Playwright

Mở Command Prompt hoặc Terminal và chạy:

```cmd
pip install playwright
```

Sau đó cài trình duyệt Chromium:

```cmd
playwright install chromium
```

**Lưu ý:** Lệnh `playwright install` sẽ tải ~300MB trình duyệt Chromium.

### Bước 3: Kiểm tra

Chạy lệnh sau để kiểm tra:

```cmd
python -m playwright --version
```

Nếu hiển thị version number → Thành công!

## Cách sử dụng trong ClipVault

1. Mở ClipVault
2. Chuyển sang tab **Douyin**
3. Nhấn nút **"Lấy Cookies Douyin"** (sẽ có sau khi bạn thêm vào giao diện)
4. Trình duyệt Chromium sẽ tự động mở
5. **Đăng nhập Douyin thủ công** trong trình duyệt đó
6. Sau khi đăng nhập xong và thấy trang chủ Douyin, quay lại Terminal/Command Prompt
7. **Nhấn Enter** trong cửa sổ terminal
8. ClipVault sẽ tự động lấy cookies và lưu vào file
9. Từ bây giờ, video Douyin sẽ tải được!

## Khắc phục sự cố

### "Python chưa được cài đặt"
- Cài Python từ python.org
- Đảm bảo tick "Add to PATH" khi cài

### "Playwright chưa được cài đặt"
```cmd
pip install playwright
playwright install chromium
```

### "playwright: command not found"
Thử:
```cmd
python -m playwright install chromium
```

### Trình duyệt không mở
- Chạy lại: `playwright install chromium`
- Kiểm tra firewall/antivirus có chặn không

### Cookies không hoạt động
- Thử lấy cookies lại (cookies có thể hết hạn)
- Đảm bảo bạn đã đăng nhập thành công trước khi nhấn Enter
- File cookies sẽ được lưu tại: `%LOCALAPPDATA%\ClipVault\douyin-cookies.txt`

## Giải pháp thay thế

Nếu không muốn cài Python/Playwright, bạn có thể:

1. **Xuất cookies thủ công** từ trình duyệt:
   - Dùng extension "Get cookies.txt LOCALLY" cho Chrome
   - Truy cập douyin.com
   - Xuất cookies
   - Lưu vào `%LOCALAPPDATA%\ClipVault\douyin-cookies.txt`
   - Xem chi tiết trong `DOUYIN_COOKIES_GUIDE.md`

2. **Cập nhật yt-dlp** thường xuyên:
   - Vào tab Cài đặt
   - Nhấn "Cập nhật yt-dlp"
   - Đôi khi yt-dlp fix được Douyin mà không cần cookies

## Lưu ý bảo mật

- Cookies được lưu **cục bộ** trên máy bạn
- ClipVault **KHÔNG gửi** cookies đi đâu cả
- File cookies chỉ dùng để tải video Douyin
- **KHÔNG chia sẻ** file cookies với người khác

## Tính năng tự động

Sau khi lấy cookies một lần:
- ✅ ClipVault tự động dùng cookies khi tải Douyin
- ✅ Không cần lấy lại cho đến khi cookies hết hạn (thường vài tuần)
- ✅ Nếu cookies hết hạn, chỉ cần chạy lại "Lấy Cookies Douyin"

## Video hướng dẫn

(Có thể thêm link video sau nếu muốn)

## Hỗ trợ

Nếu gặp vấn đề:
1. Đọc phần Khắc phục sự cố ở trên
2. Kiểm tra file log của ClipVault
3. Thử phương án xuất cookies thủ công
