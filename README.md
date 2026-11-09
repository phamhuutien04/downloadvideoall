# ClipVault

Ứng dụng desktop Windows để lưu video **công khai mà bạn sở hữu hoặc đã được chủ sở hữu cho phép tải** từ Facebook, YouTube, TikTok, X/Twitter và RedNote.

## Có gì trong app

- Năm tab độc lập: Facebook, YouTube, TikTok, X/Twitter và RedNote.
- Ba cách nhập: một video, nhiều URL, hoặc URL trang/kênh/danh sách công khai.
- Khi chọn **Trang / kênh công khai**, để giới hạn là `0` nếu muốn lấy toàn bộ video công khai mà nguồn và downloader hỗ trợ.
- Chọn chất lượng, thư mục lưu, bỏ qua video đã tải, xem tiến trình/nhật ký và dừng lượt tải.
- Chế độ **Cao nhất** luôn ưu tiên cả hình lẫn tiếng: khi có FFmpeg, các luồng tách riêng sẽ được ghép mà không giảm chất lượng; khi chưa có FFmpeg, app chỉ chọn file đã có sẵn cả hình và tiếng để tránh video bị mất tiếng.
- Mục **Cài đặt** kiểm tra cả `yt-dlp` và FFmpeg/ffprobe; người dùng có thể bấm cài hoặc cập nhật từng công cụ vào dữ liệu riêng của ClipVault.
- Sắp thư mục theo nền tảng và tác giả; không lưu cookie, thông tin đăng nhập hay mật khẩu.

## Lưu ý về RedNote

- Dán URL RedNote/Xiaohongshu công khai (ví dụ `rednote.com`, `xiaohongshu.com` hoặc liên kết chia sẻ `xhslink.com`).
- Khả năng tải phụ thuộc vào định dạng công khai mà RedNote đang cung cấp và phiên bản `yt-dlp`; hãy cập nhật yt-dlp trong Cài đặt khi cần.
- Không hỗ trợ nội dung yêu cầu đăng nhập, cookie, CAPTCHA hoặc quyền truy cập riêng tư.

## Giới hạn an toàn

- Chỉ dùng với nội dung bạn có quyền tải và lưu.
- Không hỗ trợ video riêng tư, nội dung DRM, đăng nhập, cookie, proxy hay bất kỳ cơ chế né giới hạn/né nhận diện nào.
- Việc tải playlist, kênh hay Page phụ thuộc vào URL công khai và hỗ trợ hiện thời của `yt-dlp`; một nền tảng có thể thay đổi cách cung cấp nội dung bất cứ lúc nào.

## Chạy app

Yêu cầu: Node.js 20 trở lên trên Windows.

```powershell
cd D:\facebook\dowload
npm install
npm start
```

Lần `npm install` đầu tiên, `youtube-dl-exec` cài downloader `yt-dlp` đi kèm. Một số nguồn/chất lượng cần FFmpeg để ghép luồng hình và tiếng; trong Cài đặt, ClipVault có thể kiểm tra và cài FFmpeg khi bạn chủ động bấm nút.

## Đóng gói EXE

Chạy `build_exe.bat` hoặc:

```powershell
npm run package
```

File portable được tạo trong thư mục `dist`.
