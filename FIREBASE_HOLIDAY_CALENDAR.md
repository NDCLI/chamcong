# Lịch nghỉ lễ tự cập nhật

Ứng dụng tải document Firestore `app_config/public_holidays` khi khởi động và cache bản hợp lệ trên thiết bị. Khi không có mạng hoặc document chưa được tạo, ứng dụng dùng lịch dự phòng đã có ngày nghỉ Quốc khánh 01–02/09/2026.

## Tạo document trên Firebase

1. Vào **Firebase Console → Firestore Database → Data**.
2. Tạo collection `app_config` và document `public_holidays`.
3. Sao chép nội dung trong [public-holidays.example.json](./public-holidays.example.json) vào document.

Trường `years` chỉ chứa các **ngày nghỉ bổ sung theo thông báo hằng năm**, theo định dạng `MM-DD`. Ứng dụng tự thêm các ngày cố định `01-01`, `04-30`, `05-01`, `09-02`.

Ví dụ, nếu thông báo Quốc khánh một năm quy định nghỉ thêm ngày 03/09, cập nhật thành:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2027-08-01T00:00:00+07:00",
  "years": {
    "2026": ["09-01"],
    "2027": ["09-03"]
  }
}
```

Sau khi lưu document, các máy mở app có mạng sẽ tự lấy lịch mới; không cần build hoặc deploy lại app.

## Firestore Rules

Cho phép mọi người đọc lịch, nhưng chỉ một tài khoản quản trị được ghi. Thay `ADMIN_UID` bằng UID Firebase của người quản trị:

```text
match /app_config/public_holidays {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == "ADMIN_UID";
}
```
