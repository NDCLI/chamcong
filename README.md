# Web App 

Đây là web app quản lý thông tin chấm công và tính lương, được xây dựng bằng React, TypeScript và Vite.

## Tính năng chính

- Chấm công và tính lương theo tháng dương lịch: từ ngày 1 đến ngày cuối cùng của tháng.
- Xem tổng quan lương và thu nhập, chi tiết OT/Bonus OT và biểu đồ thu nhập theo cùng kỳ tháng.
- Lưu dữ liệu riêng cho từng tháng/năm; tháng 2 tự xử lý 28/29 ngày theo năm nhuận.
- Giao diện đơn giản, dễ sử dụng trên cả máy tính và thiết bị di động.
- Tối ưu hiệu năng với React và Vite để tải trang nhanh.

## Mục đích

Ứng dụng hướng tới người dùng cần quản lý chi tiết lương và thu nhập, giúp theo dõi nhanh tình hình tài chính cá nhân.

## Triển khai

Ứng dụng đã được triển khai trực tuyến tại địa chỉ:

https://ccong.vercel.app

## Hướng dẫn chạy local

1. Cài đặt các gói:

```bash
npm install
```

2. Chạy app:

```bash
npm run dev
```

3. Kiểm tra:

```bash
npm test -- --run
```

```bash
npm run build
```

```bash
npm run lint
```

## Chuyển từ kỳ công cũ sang tháng dương lịch

- Quy tắc tháng mới áp dụng sau khi phiên bản này được triển khai. Không tự hẹn ngày chuyển đổi; có thể giữ pull request chưa gộp đến khi cần áp dụng.
- Tháng hiện tại là tháng của ngày hôm nay, không tự chuyển sang tháng tiếp theo từ ngày 25.
- Dữ liệu mới dùng khóa `YYYY-MM` trong `months` và dấu hiệu `payrollCalendar: "calendar-month"`.
- Khi tải dữ liệu cũ từ máy hoặc Cloud, app chuyển từng dòng OT về đúng tháng/năm theo ngày thực tế. Ví dụ OT ngày 25/01 đang lưu trong kỳ tháng 2 sẽ được đưa về tháng 1; OT cuối tháng 12 của năm trước vẫn được giữ và có thể xem bằng cách chọn năm trước.
- Thu nhập khác (`other`), tiền thưởng theo tháng (`bonusAmounts`, `bonuses`) giữ nguyên ở tháng được ghi nhận với năm đã lưu; không tự chia hoặc cộng lại vì những khoản này không có ngày phát sinh. Cần đối chiếu các khoản đó khi đổi chính sách kỳ công.
- Toàn bộ các kỳ cũ được giữ trong `legacyPayrollMonths` để đối chiếu; dữ liệu gốc không bị sửa. Giờ OT nhập tay được giữ nguyên và Bonus OT được tính lại theo quy tắc hiện hành.
- Chuyển đổi chỉ thực hiện một lần, không cộng giờ trùng khi tải lại hoặc đồng bộ. Không thay đổi `lastUpdated` chỉ vì chuyển đổi để giữ quy tắc ưu tiên dữ liệu mới hơn trên Cloud.
- Local storage, đồng bộ mã bí mật và đồng bộ tài khoản đều dùng định dạng tháng mới. Dữ liệu đã chuyển không tương thích để chỉnh sửa bằng phiên bản cũ; tránh dùng đồng thời phiên bản cũ và mới trên các thiết bị.
- Công thức lương cơ bản, tỷ lệ OT, thưởng hè, bảo hiểm và thuế giữ nguyên; chỉ đổi phạm vi ngày được tính trong tháng.