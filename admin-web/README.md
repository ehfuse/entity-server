# Entity Server - Admin Web

Entity Server의 관리 웹 인터페이스입니다.

## 기술 스택

- **React 19** - UI 라이브러리
- **TypeScript** - 타입 안정성
- **Vite** - 빠른 개발 환경
- **MUI (Material-UI) v7** - UI 컴포넌트 라이브러리
- **@ehfuse/mui-form-controls** - MUI 폼 컨트롤 라이브러리
- **React Router** - 라우팅
- **TanStack Query** - 서버 상태 관리
- **@ehfuse/forma** - 클라이언트 상태 관리
- **Axios** - HTTP 클라이언트
- **Emotion** - CSS-in-JS

## 주요 기능

- 🔐 사용자 인증 및 권한 관리
- 📊 대시보드 - 시스템 통계 및 개요
- 🗂️ 엔티티 관리 - CRUD 작업
- 📝 엔티티 데이터 관리
- 🎨 Material Design 기반 반응형 UI

## 시작하기

### 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```bash
VITE_API_BASE_URL=http://localhost:3400
```

### 개발 서버 실행

```bash
npm run dev
```

개발 서버가 http://localhost:5173 에서 실행됩니다.

### 빌드

```bash
npm run build
```

빌드된 파일은 `dist` 디렉토리에 생성됩니다.

### 프리뷰

```bash
npm run preview
```

## 프로젝트 구조

```
src/
├── api/              # API 클라이언트 및 엔드포인트
├── components/       # 재사용 가능한 컴포넌트
│   ├── common/       # 공통 컴포넌트
│   └── layout/       # 레이아웃 컴포넌트
├── pages/            # 페이지 컴포넌트
│   ├── auth/         # 인증 페이지
│   ├── dashboard/    # 대시보드
│   └── entities/     # 엔티티 관리 페이지
├── routes/           # 라우팅 설정
├── stores/           # Forma 상태 스토어
├── types/            # TypeScript 타입 정의
└── utils/            # 유틸리티 함수
```

## 상태 관리

- **TanStack Query**: 서버 상태 관리 (캐싱, 동기화)
- **@ehfuse/forma**: 전역 클라이언트 상태 관리 (인증, UI 상태)

## 라이선스

MIT
