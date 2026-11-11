export const MIN_PASSWORD_LENGTH = 6; // supabase/config.toml minimum_password_length 와 같다
export const TRACKED_BADGE = '추적 중';
export const TRACK_BUTTON_LABEL = '추적 요청';
export const TRACK_PAID_HINT = '유료';
export const TRACK_PAID_NOTICE = '공약 추적은 유료 기능입니다';
export const GUEST_SEARCH_NOTE =
  '정치인 찾기와 공약 보기는 로그인 없이 쓸 수 있습니다. 추적 요청만 로그인이 필요합니다';
export const TRACK_LOGIN_REQUIRED_NOTICE = '추적 요청은 로그인한 회원만 할 수 있습니다';
export const TRACK_LOGIN_REQUIRED_DETAIL = '로그인하거나 가입하면 이 화면으로 돌아와 요청을 이어서 할 수 있습니다';
export const LOGIN_TO_REQUEST_LABEL = '로그인하고 요청하기';
export const SIGNUP_TO_REQUEST_LABEL = '가입하고 요청하기';
export const SEARCH_PLACEHOLDER = '이름·지역으로 찾기 (예: 대구, 수원시장)';
export const SEARCH_HINT = '이름이나 지역을 입력하면 바로 찾아 드립니다';
export const SEARCH_LOADING_TEXT = '찾는 중…';
export const SEARCH_EMPTY_TEXT = '검색 결과가 없습니다. 찾는 사람이 없으면 아래에서 직접 요청할 수 있습니다';
export const SEARCH_FILTER_EMPTY_TEXT = '이 조건에 맞는 결과가 없습니다';
export const TRACK_REQUEST_NOTICE = '이 기능을 활성화하려면 관리자에게 문의하세요';
export const ADMIN_CONTACT_EMAIL = 'admin@example.com';
export const ADMIN_CONTACT_LABEL = '관리자 이메일';
export const TOUR_NOTICE = '체험용 가상 데이터입니다. 여기서 바꾼 내용은 어디에도 저장되지 않습니다';
export const SEARCH_ERROR_TEXT = {
  query_required: '검색어를 적어 주세요',
  query_too_long: '검색어는 40자 이하로 적어 주세요',
  unknown: '검색하지 못했습니다',
} as const;
export const AUTH_TEXT = {
  email_required: '이메일을 적어 주세요',
  password_short: '비밀번호는 6자 이상이어야 합니다',
  password_mismatch: '비밀번호가 서로 다릅니다',
  already_registered: '이미 가입된 이메일입니다',
  signup_failed: '가입하지 못했습니다',
  login_failed: '이메일 또는 비밀번호가 맞지 않습니다',
  already_signed_in: '이미 로그인했습니다',
} as const;
export const FREE_REQUEST_TEXT = {
  title: '찾는 정치인이 목록에 없나요?',
  name_required: '이름을 적어 주세요',
  region_required: '지역을 적어 주세요',
  office_required: '직위를 적어 주세요',
  toggle: '찾는 사람이 없나요? 직접 요청하기',
} as const;

export type HowStepKey = 'source' | 'structure' | 'evidence' | 'review' | 'publish';
export const HOW_IT_WORKS: readonly { key: HowStepKey; title: string; body: string }[] = [
  {
    key: 'source',
    title: '원문 수집',
    body: '선관위 정책·공약마당의 당선인 선거공약서(PDF·HWP)를 받아 Markdown 으로 바꿉니다.',
  },
  {
    key: 'structure',
    title: '공약 구조화',
    body: '공약을 항목 하나씩 나눠 분야·키워드·원문 위치와 함께 JSON 으로 정리합니다.',
  },
  {
    key: 'evidence',
    title: '근거 수집',
    body: '매주 시 보도자료 같은 공개 자료에서 공약 키워드가 들어간 글을 근거 후보로 모읍니다.',
  },
  {
    key: 'review',
    title: '사람 검수',
    body: '사람이 후보를 읽고 근거로 채택하거나 무관으로 넘기며, 상태를 바꿀 때는 이유를 한 줄 남깁니다.',
  },
  {
    key: 'publish',
    title: '공개',
    body: '공약별 상태와 근거 링크, 변경 이력을 누구나 볼 수 있게 공개하고 이의 제기를 받습니다.',
  },
];

// '/' 로 시작하고 '//' 로 시작하지 않으면 next, 아니면 '/search'
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/search';
}
