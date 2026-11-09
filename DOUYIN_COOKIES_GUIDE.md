# Hướng dẫn xuất Cookies cho Douyin

## Tại sao cần cookies?

Douyin đôi khi yêu cầu cookies để xác minh bạn không phải là bot. ClipVault đã tự động thêm User-Agent và headers cần thiết, nhưng trong một số trường hợp, bạn vẫn cần cung cấp cookies từ trình duyệt.

## Cách xuất cookies từ Chrome/Edge

### Bước 1: Cài đặt Extension

1. Mở Chrome hoặc Edge
2. Truy cập: https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
3. Cài đặt extension "Get cookies.txt LOCALLY"

### Bước 2: Truy cập Douyin

1. Mở trình duyệt và truy cập https://www.douyin.com
2. Không cần đăng nhập - chỉ cần trang web load thành công
3. Click vào icon extension "Get cookies.txt LOCALLY"
4. Click "Export" để tải file cookies

### Bước 3: Đặt file cookies vào đúng vị trí

1. Mở File Explorer
2. Gõ vào thanh địa chỉ: `%LOCALAPPDATA%\ClipVault`
3. Copy file cookies vừa tải được vào thư mục này
4. Đổi tên file thành: `douyin-cookies.txt`

### Bước 4: Thử lại tải video

1. Mở lại ClipVault
2. Thử tải video Douyin - cookies sẽ tự động được sử dụng

## Cách xuất cookies từ Firefox

### Bước 1: Cài đặt Add-on

1. Mở Firefox
2. Truy cập: https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/
3. Cài đặt add-on "cookies.txt"

### Bước 2: Xuất cookies

1. Truy cập https://www.douyin.com
2. Click vào icon add-on "cookies.txt"
3. Click "Current Site" để xuất cookies của Douyin
4. Lưu file

### Bước 3: Đặt file cookies

Giống như hướng dẫn Chrome ở trên - đặt file vào `%LOCALAPPDATA%\ClipVault` và đổi tên thành `douyin-cookies.txt`

## Lưu ý quan trọng

- Cookies sẽ hết hạn sau một thời gian (thường là vài tuần đến vài tháng)
- Nếu ClipVault báo lỗi "Fresh cookies are needed" sau một thời gian, hãy xuất cookies mới
- **BẢO MẬT**: Đừng chia sẻ file cookies với người khác - nó chứa thông tin phiên làm việc của bạn
- Cookies được lưu cục bộ trên máy bạn, ClipVault không gửi chúng đi đâu cả

## Kiểm tra vị trí lưu cookies

Để biết chính xác thư mục ClipVault lưu dữ liệu:

1. Mở ClipVault
2. Nhấn `Ctrl+Shift+I` để mở DevTools (nếu được kích hoạt)
3. Gõ: `require('electron').app.getPath('userData')`
4. Đây là đường dẫn chính xác nơi bạn cần đặt file `douyin-cookies.txt`

## Khắc phục sự cố

### "Fresh cookies are needed" ngay cả sau khi thêm cookies

1. Kiểm tra tên file phải chính xác là `douyin-cookies.txt`
2. Kiểm tra file có ở đúng thư mục `%LOCALAPPDATA%\ClipVault`
3. Mở file cookies bằng Notepad - đảm bảo có nội dung và không bị lỗi định dạng
4. Thử xuất cookies mới từ trình duyệt
5. Đảm bảo trình duyệt đã truy cập Douyin trước khi xuất cookies

### Tải video vẫn thất bại

1. Douyin có thể tạm thời chặn tải xuống từ IP của bạn
2. Đợi vài phút rồi thử lại
3. Thử với URL video khác để kiểm tra
4. Cập nhật yt-dlp lên phiên bản mới nhất trong mục Cài đặt

## Không muốn dùng cookies?

User-Agent và headers đã được tự động thêm vào ClipVault. Hãy thử tải video trước - nhiều video Douyin công khai vẫn tải được mà không cần cookies. Chỉ thêm cookies khi thực sự gặp lỗi.
