# Research Workspace

Ứng dụng nghiên cứu tài liệu với AI: tải tài liệu lên, chọn nguồn tham khảo và đặt câu hỏi để nhận câu trả lời có trích dẫn từ nội dung đã cung cấp.

## Tính năng

- Hỗ trợ PDF, DOCX, TXT và Markdown; tối đa 20 MB mỗi tệp.
- Trích xuất văn bản, chia đoạn và tìm nội dung liên quan đến câu hỏi.
- Tạo câu trả lời bằng Gemini theo cấu trúc: tóm tắt, ý chính, bằng chứng, rủi ro và bước tiếp theo.
- Hiển thị trích đoạn bằng chứng cùng tên tài liệu và số trang PDF khi có.
- Lưu lịch sử nghiên cứu, tạo lại câu trả lời và sao chép kết quả.
- Giao diện tương thích máy tính và thiết bị di động.

## Công nghệ

Next.js (App Router), React, TypeScript, Tailwind CSS, Firebase Authentication, Cloud Firestore và Gemini API.

## Chạy trên máy cá nhân

**Yêu cầu:** Node.js 20 trở lên và pnpm 10.

1. Tạo dự án Firebase, bật **Anonymous Authentication** và tạo cơ sở dữ liệu **Cloud Firestore**.
2. Đăng ký ứng dụng Web trong Firebase để lấy cấu hình SDK. Tạo Gemini API key trong Google AI Studio.
3. Sao chép `.env.example` thành `.env.local` và điền các biến môi trường:

   | Biến | Mô tả |
   | --- | --- |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | API key của ứng dụng Firebase Web |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain của dự án Firebase |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID của ứng dụng Firebase Web |
   | `FIREBASE_PROJECT_ID` | Project ID dùng bởi các API route phía máy chủ |
   | `GEMINI_API_KEY` | Gemini API key, chỉ dùng phía máy chủ |
   | `GEMINI_MODEL` | Mã model Gemini; xem giá trị mặc định trong `.env.example` |

4. Triển khai quy tắc truy cập trong `firestore.rules` bằng Firebase CLI:

   ```bash
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

5. Cài đặt và khởi chạy:

   ```bash
   corepack pnpm install
   corepack pnpm dev
   ```

Mở [http://localhost:3000](http://localhost:3000) để sử dụng. Có thể dùng `corepack pnpm build` và `corepack pnpm start` để chạy bản production.

## Lưu trữ và giới hạn

Firebase Authentication tạo phiên đăng nhập ẩn danh. Văn bản trích xuất, thông tin tài liệu và lịch sử nghiên cứu được lưu trong Firestore theo người dùng, với quyền truy cập được giới hạn bởi `firestore.rules`. Tệp gốc được giữ trong IndexedDB của trình duyệt đã tải lên; mở lại tệp gốc trên thiết bị khác sẽ không khả dụng.

Ứng dụng cần môi trường chạy Next.js hỗ trợ API route phía máy chủ. PDF dạng ảnh chưa có OCR. Mỗi tài liệu được giới hạn 400 đoạn văn bản sau khi trích xuất.
