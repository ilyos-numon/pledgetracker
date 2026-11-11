// 사용법: scripts/sb-env.sh node scripts/create-reviewer.ts --email <e> --password <p>
// 공개 가입이 꺼져 있으므로 검수자는 이 스크립트로만 만든다. 이미 있으면 비밀번호를 바꾸고 검수자로 등록한다.
import { parseArgs } from 'node:util';
import { adminClient } from '../src/db/admin.ts';

const { values } = parseArgs({ options: { email: { type: 'string' }, password: { type: 'string' } } });
if (!values.email || !values.password) {
  console.error('usage: node scripts/create-reviewer.ts --email <e> --password <p>');
  process.exit(2);
}
const email = values.email.toLowerCase();
const db = adminClient();

let userId: string | undefined;
const created = await db.auth.admin.createUser({ email, password: values.password, email_confirm: true });
if (created.data.user) {
  userId = created.data.user.id;
} else {
  for (let page = 1; !userId; page++) {
    const list = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (list.error) throw new Error(`listUsers: ${list.error.message}`);
    userId = list.data.users.find((u) => u.email === email)?.id;
    if (list.data.users.length < 200) break;
  }
  if (!userId) throw new Error(`createUser: ${created.error?.message ?? 'unknown error'}`);
  const upd = await db.auth.admin.updateUserById(userId, { password: values.password });
  if (upd.error) throw new Error(`updateUser: ${upd.error.message}`);
}

const reg = await db.from('reviewers').upsert({ user_id: userId }, { onConflict: 'user_id' });
if (reg.error) throw new Error(`reviewers: ${reg.error.message}`);
console.log(`reviewer email=${email} user_id=${userId}`);
