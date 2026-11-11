import { expect, type Page, test } from '@playwright/test';
import { AUTH_TEXT } from '../../src/core/membership.ts';
import { createMember, deleteUserByEmail, newMemberCredentials } from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

function trackAuth(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/auth/v1/signup') || req.url().includes('/auth/v1/token')) hits.push(req.url());
  });
  return hits;
}

async function fillSignup(page: Page, email: string, password: string, confirm: string) {
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(confirm);
  await page.getByRole('button', { name: '가입하기', exact: true }).click();
}

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

test('새 이메일로 가입하면 /search 로 가고 머리글에 이메일이 보인다', async ({ page }) => {
  const { email, password } = newMemberCredentials();
  try {
    await page.goto('/signup');
    await expect(page.getByRole('link', { name: '이미 계정이 있나요? 로그인', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await shot(page, 'auth-signup');
    await fillSignup(page, email, password, password);
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByTestId('nav-user')).toHaveText(email);

    await page.goto('/signup');
    await expect(page.getByTestId('auth-info')).toHaveText(AUTH_TEXT.already_signed_in);
    await expect(page.getByRole('link', { name: '정치인 찾기로', exact: true })).toHaveAttribute('href', '/search');
    await expect(page.getByRole('button', { name: '가입하기', exact: true })).toHaveCount(0);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('이미 있는 이메일로 가입하면 "이미 가입된 이메일입니다" 이고 /signup 에 머문다', async ({ page }) => {
  const member = await createMember();
  try {
    await page.goto('/signup');
    const other = newMemberCredentials().password;
    await fillSignup(page, member.email, other, other);
    await expect(page.getByTestId('auth-error')).toHaveText(AUTH_TEXT.already_registered);
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId('nav-login')).toBeVisible();
    await shot(page, 'auth-signup-duplicate');
  } finally {
    await member.cleanup();
  }
});

test('짧은 비밀번호·불일치·빈 이메일은 요청 없이 막힌다', async ({ page }) => {
  const hits = trackAuth(page);
  const { email } = newMemberCredentials();
  await page.goto('/signup');

  await fillSignup(page, '', 'abcdef', 'abcdef');
  await expect(page.getByTestId('auth-error')).toHaveText(AUTH_TEXT.email_required);

  await fillSignup(page, email, 'abc', 'abc');
  await expect(page.getByTestId('auth-error')).toHaveText(AUTH_TEXT.password_short);

  await fillSignup(page, email, 'abcdef', 'abcdeg');
  await expect(page.getByTestId('auth-error')).toHaveText(AUTH_TEXT.password_mismatch);
  await shot(page, 'auth-signup-mismatch');

  await expect(page).toHaveURL(/\/signup$/);
  expect(hits).toEqual([]);
});

test('틀린 비밀번호로 로그인하면 "이메일 또는 비밀번호가 맞지 않습니다"', async ({ page }) => {
  const member = await createMember();
  try {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: '처음이신가요? 가입', exact: true })).toHaveAttribute(
      'href',
      '/signup',
    );
    await fillLogin(page, member.email, `${member.password}-wrong`);
    await expect(page.getByTestId('auth-error')).toHaveText(AUTH_TEXT.login_failed);
    await expect(page).toHaveURL(/\/login$/);
    await shot(page, 'auth-login-failed');
  } finally {
    await member.cleanup();
  }
});

test('로그인 성공은 안전한 next 로만 간다 — /criteria 는 따르고 //evil 은 /search', async ({ page }) => {
  const member = await createMember();
  try {
    await page.goto('/login?next=/criteria');
    await fillLogin(page, member.email, member.password);
    await expect(page).toHaveURL(/\/criteria$/);
    await expect(page.getByTestId('nav-user')).toHaveText(member.email);

    await page.goto('/login');
    await expect(page.getByTestId('auth-info')).toHaveText(AUTH_TEXT.already_signed_in);
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toHaveCount(0);
    await shot(page, 'auth-login-already');

    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/login?next=//evil.example.org');
    await expect(page.getByTestId('nav-login')).toBeVisible();
    await fillLogin(page, member.email, member.password);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/search$/);
  } finally {
    await member.cleanup();
  }
});

test('회원으로 /review 를 열면 "검수 권한이 없습니다"', async ({ page }) => {
  const member = await createMember();
  try {
    await page.goto('/login?next=/review');
    await fillLogin(page, member.email, member.password);
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByTestId('review-error')).toHaveText('검수 권한이 없습니다');
    await expect(page.getByTestId('candidate-item')).toHaveCount(0);
  } finally {
    await member.cleanup();
  }
});
