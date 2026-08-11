# Hướng dẫn Deploy

## Deploy lên Vercel

### 1. Chuẩn bị

Đảm bảo bạn đã có:
- Tài khoản [Vercel](https://vercel.com)
- Firebase project đã được setup
- Git repository (GitHub, GitLab, hoặc Bitbucket)

### 2. Thiết lập Environment Variables trên Vercel

Trong Vercel Dashboard > Project Settings > Environment Variables, thêm các biến sau:

```
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_POSTHOG_KEY=your_posthog_key (optional)
VITE_POSTHOG_HOST=https://us.i.posthog.com (optional)
```

**Lưu ý:** Các giá trị Firebase có thể lấy từ Firebase Console > Project Settings > General > Your apps

### 3. Deploy

#### Option 1: Deploy qua Vercel Dashboard
1. Đăng nhập vào Vercel
2. Click "New Project"
3. Import repository của bạn
4. Vercel sẽ tự động detect Vite framework
5. Thêm Environment Variables (xem bước 2)
6. Click "Deploy"

#### Option 2: Deploy qua Vercel CLI
```bash
# Cài đặt Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy production
vercel --prod
```

### 4. Cấu hình Firebase cho domain mới

Sau khi deploy, thêm domain Vercel của bạn vào Firebase:
1. Firebase Console > Authentication > Settings > Authorized domains
2. Thêm domain Vercel (vd: `your-app.vercel.app`)

### 5. Kiểm tra

- Test authentication flow
- Test sync cloud data
- Kiểm tra console log xem có lỗi không

## Build Local

```bash
npm run build
npm run preview
```

## Troubleshooting

### Build fails
- Chạy `npm run lint` để check lỗi
- Chạy `npm run test` để check tests
- Đảm bảo tất cả dependencies đã được cài đặt

### Firebase không hoạt động
- Kiểm tra environment variables đã được set đúng
- Kiểm tra domain đã được thêm vào Authorized domains
- Check Firebase Console > Usage để xem có lỗi không

### Performance issues
- Kiểm tra bundle size: file lớn nhất không nên quá 250KB gzipped
- Sử dụng Lighthouse để đo performance
- Check Network tab để xem các request nào chậm
